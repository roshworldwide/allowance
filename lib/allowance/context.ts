// App-wide singletons (kept on globalThis so Next dev reloads don't open a second DB or poller).
import 'server-only';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildWorld, type World } from '@/lib/catalog';
import demoOverlay from '@/catalog/overlays/demo.json';
import type { CatalogOverlay } from '@/lib/catalog';
import { paypal, type PayPalClient } from '@/lib/paypal/client';
import { getDb, type Db } from '@/lib/store/db';
import { kv } from '@/lib/store/repo';
import { importReplays } from '@/lib/store/seed';
import { SqliteChainStore } from '@/lib/store/sqlite-chain';
import { SqliteLedger } from '@/lib/store/sqlite-ledger';

export type LiveEvent = {
  mandateId: string;
  type: 'agent' | 'decision' | 'purchase' | 'approval' | 'refund' | 'mandate' | 'explanation' | 'webhook';
  at: string;
  data: unknown;
};

type Ctx = { db: Db; world: World; ledger: SqliteLedger; chain: SqliteChainStore; bus: EventEmitter; paypal: () => PayPalClient };

const g = globalThis as unknown as { __allowance?: Ctx };

export function ctx(): Ctx {
  if (g.__allowance) return g.__allowance;
  const db = getDb();
  const bus = new EventEmitter();
  bus.setMaxListeners(200);
  g.__allowance = {
    db,
    world: buildWorld([demoOverlay as CatalogOverlay]),
    ledger: new SqliteLedger(db),
    chain: new SqliteChainStore(db),
    bus,
    paypal,
  };
  seedDemoVault(db);
  // Rebuild history from recorded sandbox runs (the deployed disk is ephemeral).
  try {
    importReplays(db);
  } catch (e) {
    console.error(`[ALLOWANCE] replay import failed: ${(e as Error).message}`);
  }
  return g.__allowance;
}

export function emit(e: Omit<LiveEvent, 'at'>) {
  ctx().bus.emit('event', { ...e, at: new Date().toISOString() } satisfies LiveEvent);
}

/**
 * The saved sandbox wallet live sessions draw on. Deployed: DEMO_VAULT_TOKEN_ID / DEMO_VAULT_CUSTOMER_ID
 * (Render's free disk is wiped on spin-down, so this re-seeds on every boot). Locally: the file written
 * by `npm run spike:vault`.
 */
function seedDemoVault(db: Db) {
  // E2E runs in the same folder as the owner's dev setup; never let them inherit the owner's saved
  // wallet (they assert the unlinked "PENDING LINK" state and must not touch a real sandbox token).
  if (process.env.E2E === '1') return;
  const fromEnv = process.env.DEMO_VAULT_TOKEN_ID;
  if (fromEnv) {
    kv.set(db, 'demo_vault_token', fromEnv);
    kv.set(db, 'demo_vault_customer', process.env.DEMO_VAULT_CUSTOMER_ID ?? '');
    return;
  }
  const file = path.join(process.cwd(), 'data', 'vault-token.json');
  if (existsSync(file)) {
    try {
      const v = JSON.parse(readFileSync(file, 'utf8')) as { paymentTokenId?: string; customerId?: string };
      if (v.paymentTokenId) {
        kv.set(db, 'demo_vault_token', v.paymentTokenId);
        kv.set(db, 'demo_vault_customer', v.customerId ?? '');
      }
    } catch {
      /* ignore a malformed local file */
    }
  }
}

export function demoVault(): { tokenRef: string; customerRef: string | null } | null {
  const db = ctx().db;
  const tokenRef = kv.get(db, 'demo_vault_token');
  return tokenRef ? { tokenRef, customerRef: kv.get(db, 'demo_vault_customer') || null } : null;
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}
