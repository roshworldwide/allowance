// npm run smoke:sandbox — live PayPal sandbox smoke test on the saved wallet (needs your keys + spike S1):
// $1.00 vault order → COMPLETED → refund → COMPLETED. Prints ids only.
import './_env';
import { existsSync, readFileSync } from 'node:fs';
import { createPayPalClient } from '../lib/paypal/client';
import { buildPurchaseUnit, captureOf, captureOrder, createVaultOrder } from '../lib/paypal/orders';
import { maskId } from '../lib/paypal/redact';
import { refundCapture } from '../lib/paypal/refunds';

async function main() {
  const fromFile = existsSync('data/vault-token.json') ? (JSON.parse(readFileSync('data/vault-token.json', 'utf8')) as { paymentTokenId: string }).paymentTokenId : undefined;
  const vaultId = process.env.DEMO_VAULT_TOKEN_ID || fromFile;
  if (!vaultId) throw new Error('No saved wallet: run `npm run spike:vault` first (or set DEMO_VAULT_TOKEN_ID).');
  const pp = createPayPalClient();
  const id = `smoke-${Date.now()}`;
  const { unit } = buildPurchaseUnit({ referenceId: id, customId: 'smoke', invoiceId: id, description: 'ALLOWANCE smoke test', lines: [{ name: 'ALLOWANCE smoke test', sku: 'SMOKE-001', unitAmountCents: 100, quantity: 1 }] });
  let order = await createVaultOrder(pp, { vaultId, unit, requestId: id });
  if (order.status !== 'COMPLETED') order = await captureOrder(pp, order.id, `capture-${id}`);
  const cap = captureOf(order);
  if (!cap || cap.status !== 'COMPLETED') throw new Error(`Capture not completed (order ${order.id} ${order.status}, capture ${cap?.status})`);
  const refund = await refundCapture(pp, cap.id, { requestId: `undo-${id}`, noteToPayer: 'ALLOWANCE smoke test' });
  const ok = refund.status === 'COMPLETED';
  console.log(`${ok ? '✓' : '✗'} smoke:sandbox  wallet ${maskId(vaultId)} · order ${order.id} ${order.status} · capture ${cap.id} ${cap.status} · refund ${refund.id} ${refund.status}`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error(`✗ smoke:sandbox failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
