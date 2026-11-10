// Allowances (mandates): create, link PayPal (Vault v3 consent), revoke.
import 'server-only';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mandatePreset, type MandatePreset } from '@/lib/guard';
import { DEMO_PRESET } from '@/lib/guard/policy';
import { maskId } from '@/lib/paypal/redact';
import { createPaymentToken, createPayPalSetupToken, deletePaymentToken } from '@/lib/paypal/vault';
import { getMandate, insertMandate, kv, linkVault, setMandateStatus, type StoredMandate } from '@/lib/store/repo';
import { ctx, demoVault, emit, publicBaseUrl } from './context';

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

/**
 * A fresh allowance for this session. When a sandbox wallet is already saved (the deployed demo's
 * shared token, or the owner's from spike S1), it is bound immediately: each session gets its own
 * mandate and ledger on top of it, so sessions never drain each other.
 */
export function createMandate(input: { sessionId: string; preset?: Partial<MandatePreset> }): StoredMandate {
  const { db, chain } = ctx();
  const vault = demoVault();
  const m = mandatePreset({ id: newId('mnd'), now: new Date(), preset: { ...DEMO_PRESET, ...input.preset }, vaultLinked: Boolean(vault) });
  insertMandate(db, m, { sessionId: input.sessionId, vaultTokenRef: vault?.tokenRef ?? null, vaultCustomerRef: vault?.customerRef ?? null });
  chain.record('mandate.created', { mandateId: m.id, budgetCents: m.budgetCents, perPurchaseCapCents: m.perPurchaseCapCents, stepUpAboveCents: m.stepUpAboveCents, linked: Boolean(vault) });
  emit({ mandateId: m.id, type: 'mandate', data: { status: m.status } });
  return getMandate(db, m.id)!;
}

/** Owner mode: start the PayPal Vault approval (saved wallet, usage_type MERCHANT, no purchase). */
export async function startVaultLink(mandateId: string): Promise<{ approveUrl: string }> {
  const { db, paypal } = ctx();
  const sm = getMandate(db, mandateId);
  if (!sm) throw new Error('No such allowance');
  const base = publicBaseUrl();
  const setup = await createPayPalSetupToken(paypal(), {
    description: `ALLOWANCE — agent allowance for ${sm.mandate.name}`,
    returnUrl: `${base}/api/allowance/vault/return`,
    cancelUrl: `${base}/errand?link=cancelled`,
    requestId: `setup-${mandateId}-${Date.now()}`,
  });
  kv.set(db, `setup:${setup.id}`, mandateId);
  return { approveUrl: setup.approveUrl };
}

/** PayPal return: upgrade the approved setup token to a payment token and activate the allowance. */
export async function completeVaultLink(setupTokenId: string): Promise<string> {
  const { db, chain, paypal } = ctx();
  const mandateId = kv.get(db, `setup:${setupTokenId}`);
  if (!mandateId) throw new Error('Unknown or expired PayPal approval');
  const token = await createPaymentToken(paypal(), setupTokenId, `ptoken-${setupTokenId}`);
  linkVault(db, mandateId, token.id, token.customerId ?? null);
  // The newest owner-linked wallet becomes the one later sessions use; the full id stays in a
  // git-ignored local file for the owner to copy into Render's env vars.
  kv.set(db, 'demo_vault_token', token.id);
  kv.set(db, 'demo_vault_customer', token.customerId ?? '');
  if (process.env.OWNER_MODE === 'true') {
    mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
    writeFileSync(path.join(process.cwd(), 'data', 'vault-token.json'), JSON.stringify({ paymentTokenId: token.id, customerId: token.customerId, setupTokenId, createdAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  }
  chain.record('mandate.linked', { mandateId, vaultToken: maskId(token.id) });
  emit({ mandateId, type: 'mandate', data: { status: 'ACTIVE', vaultToken: maskId(token.id) } });
  return mandateId;
}

/**
 * Kill switch. Owner mode also deletes the payment token at PayPal (DELETE /v3/vault/payment-tokens);
 * on the public demo it is a local status change, so a visitor can't delete the shared sandbox token.
 */
export async function revokeMandate(mandateId: string, opts: { owner: boolean }) {
  const { db, chain, paypal } = ctx();
  const sm = getMandate(db, mandateId);
  if (!sm) throw new Error('No such allowance');
  let atPayPal = false;
  if (opts.owner && sm.vaultTokenRef) {
    await deletePaymentToken(paypal(), sm.vaultTokenRef);
    atPayPal = true;
    if (kv.get(db, 'demo_vault_token') === sm.vaultTokenRef) kv.set(db, 'demo_vault_token', '');
  }
  setMandateStatus(db, mandateId, 'REVOKED', true);
  chain.record('mandate.revoked', { mandateId, atPayPal });
  emit({ mandateId, type: 'mandate', data: { status: 'REVOKED', atPayPal } });
  return { atPayPal };
}

/** Public shape of an allowance (vault token masked, money in cents, live totals). */
export function publicMandate(sm: StoredMandate) {
  const totals = ctx().ledger.totals(sm.mandate.id);
  return {
    ...sm.mandate,
    vaultToken: sm.vaultTokenRef ? maskId(sm.vaultTokenRef) : null,
    committedCents: totals.committedCents,
    reservedCents: totals.reservedCents,
    remainingCents: Math.max(0, sm.mandate.budgetCents - totals.committedCents - totals.reservedCents),
  };
}
