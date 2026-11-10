// Seeds the store on boot from recorded sandbox runs (replays/*.json). Render's free disk is wiped on
// spin-down, so the deployed Control Room rebuilds its history from these real recordings each boot.
// Synthetic previews are never imported.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Intent, Mandate, TaskContract, Verdict } from '@/lib/guard';
import type { DecisionView } from '@/lib/views';
import type { Db } from './db';
import { insertContract, insertDecision, insertMandate, kv, setDecisionStatus, upsertPurchase, upsertRefund } from './repo';
import { SqliteLedger } from './sqlite-ledger';

type ReplayFile = {
  meta: { id: string; recordedAt: string; task: string; synthetic?: boolean; contract?: TaskContract; mandate?: Mandate };
  events: { t: number; source: string; type: string; data: Record<string, unknown> }[];
};

export function importReplays(db: Db, dir = path.join(process.cwd(), 'replays')): number {
  if (!existsSync(dir)) return 0;
  const ledger = new SqliteLedger(db);
  let imported = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    let r: ReplayFile;
    try {
      r = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as ReplayFile;
    } catch {
      continue;
    }
    if (r.meta.synthetic || !r.meta.mandate || !r.meta.contract || kv.get(db, `replay_imported:${r.meta.id}`)) continue;
    const suffix = r.meta.id.replace(/[^a-z0-9]/gi, '').slice(-10);
    const mandate: Mandate = { ...r.meta.mandate, id: `mnd_replay_${suffix}`, name: `${r.meta.mandate.name} (recorded)` };
    const contract: TaskContract = { ...r.meta.contract, id: `tc_replay_${suffix}`, mandateId: mandate.id };
    const base = Date.parse(r.meta.recordedAt);
    db.transaction(() => {
      insertMandate(db, mandate, { sessionId: `replay:${r.meta.id}`, vaultTokenRef: null });
      insertContract(db, contract, r.meta.task);
      const ids = new Map<string, string>();
      for (const e of r.events) {
        const at = new Date(base + e.t).toISOString();
        if (e.type === 'decision') {
          const v = e.data as unknown as DecisionView;
          const id = `${v.decisionId}_r${suffix.slice(-4)}`;
          ids.set(v.decisionId, id);
          const verdict: Verdict = {
            decisionId: id,
            verdict: v.verdict,
            amountCents: v.amountCents,
            rules: v.rules.map((x) => ({ id: x.id as Verdict['rules'][number]['id'], name: x.name, kind: x.kind as 'block' | 'step_up', outcome: x.outcome as Verdict['rules'][number]['outcome'], detail: x.detail, ...(x.message ? { userMessage: x.message } : {}) })),
            firstBlock: (v.firstBlock ?? undefined) as Verdict['firstBlock'],
            stepUpReasons: v.stepUpReasons as Verdict['stepUpReasons'],
            binding: v.sku ? { sku: v.sku, name: v.item ?? v.sku, merchantId: '', unitCents: 0, qty: v.qty ?? 1 } : undefined,
            summary: v.summary,
            reserved: false,
            at: v.at ?? at,
            latencyUs: v.latencyUs,
          };
          const intent = (v.intent ?? { kind: v.sku ? 'PURCHASE' : 'OTHER_MONEY', toolName: v.tool, sku: v.sku ?? undefined, qty: v.qty ?? undefined, overrides: {}, rawArgsHash: '' }) as Intent;
          insertDecision(db, verdict, { mandateId: mandate.id, contractId: contract.id, runId: `replay_${suffix}`, intent, tool: v.tool, source: 'replay' });
          db.prepare('UPDATE decisions SET merchant_id = (SELECT merchant_id FROM decisions WHERE id = ?) WHERE id = ?').run(id, id);
        } else if (e.type === 'purchase' && e.data.status === 'COMPLETED') {
          const id = ids.get(String(e.data.decisionId));
          if (!id) continue;
          const amount = Number(e.data.amountCents ?? 0);
          ledger.atomically((tx) => tx.reserve({ decisionId: id, mandateId: mandate.id, contractId: contract.id, qty: 1, amountCents: amount, createdMs: base + e.t }));
          ledger.commit(id);
          upsertPurchase(db, { decisionId: id, orderId: String(e.data.orderId ?? ''), captureId: String(e.data.captureId ?? ''), status: 'COMPLETED', amountCents: amount, path: (e.data.path as 'VAULT') ?? 'VAULT', capturedAt: at });
          setDecisionStatus(db, id, 'EXECUTED');
        } else if (e.type === 'refund' && e.data.status === 'COMPLETED') {
          const id = ids.get(String(e.data.decisionId));
          if (!id) continue;
          upsertRefund(db, { decisionId: id, captureId: '', refundId: String(e.data.refundId ?? ''), status: 'COMPLETED', amountCents: Number(e.data.amountCents ?? 0) });
          if (ledger.get(id)?.status === 'COMMITTED') ledger.refund(id);
          upsertPurchase(db, { decisionId: id, status: 'REFUNDED', amountCents: Number(e.data.amountCents ?? 0), path: 'VAULT' });
          setDecisionStatus(db, id, 'REFUNDED');
        } else if (e.type === 'approval' && (e.data.status === 'DECLINED' || e.data.status === 'EXPIRED')) {
          const id = ids.get(String(e.data.decisionId));
          if (id) setDecisionStatus(db, id, 'DECLINED');
        }
      }
      kv.set(db, `replay_imported:${r.meta.id}`, new Date().toISOString());
    })();
    imported++;
  }
  return imported;
}
