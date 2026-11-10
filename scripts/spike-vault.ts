// Spike S1 — the whole real money path in one command (PayPal sandbox):
//   setup token → you approve in PayPal (US sandbox Personal account) → payment token (saved wallet)
//   → $1.00 vault order COMPLETED → refund COMPLETED → idempotency replay check.
// Prints ids only (vault token and customer ids masked). The full vault token is written to
// data/vault-token.json (git-ignored, chmod 600) for you to copy into Render yourself later.
// Redacted responses are saved as contract-test fixtures.
//
//   npm run spike:vault            reuse the saved token if there is one
//   npm run spike:vault -- --fresh link a new wallet even if a token is saved
import './_env';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createPayPalClient, type PayPalClient } from '../lib/paypal/client';
import { formatUsd } from '../lib/paypal/money';
import { buildPurchaseUnit, captureOf, captureOrder, createVaultOrder } from '../lib/paypal/orders';
import { maskId, redact } from '../lib/paypal/redact';
import { refundCapture } from '../lib/paypal/refunds';
import { createPaymentToken, createPayPalSetupToken, getSetupToken } from '../lib/paypal/vault';

const PORT = 3999;
const TOKEN_FILE = 'data/vault-token.json';
const FIXTURES = 'tests/contract/fixtures/paypal';

type SavedVault = { paymentTokenId: string; customerId?: string; setupTokenId: string; createdAt: string };

const sensitive: string[] = [];
function fixture(name: string, body: unknown) {
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(`${FIXTURES}/${name}`, JSON.stringify(redact(body, { maskValues: sensitive }), null, 2) + '\n');
}

function step(n: number, text: string) {
  console.log(`\n[${n}] ${text}`);
}

async function waitForApproval(pp: PayPalClient, setupTokenId: string): Promise<'redirect' | 'poll'> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (how: 'redirect' | 'poll' | Error) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      clearTimeout(timeout);
      server.close();
      if (how instanceof Error) reject(how);
      else resolve(how);
    };
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (url.pathname === '/vault/cancel') {
        res.end('<body style="font:16px system-ui;background:#0a0f1e;color:#e8ecf6;padding:40px">Cancelled. You can close this tab.</body>');
        finish(new Error('Approval was cancelled in PayPal.'));
        return;
      }
      res.end('<body style="font:16px system-ui;background:#0a0f1e;color:#e8ecf6;padding:40px"><h2 style="color:#3ddc97">PayPal linked ✓</h2>Back to the terminal — ALLOWANCE is finishing the spike.</body>');
      if (url.pathname === '/vault/return') finish('redirect');
    });
    server.on('error', (e) => console.log(`   (local return server unavailable: ${e.message}; polling PayPal instead)`));
    server.listen(PORT);
    // Capture must not depend on the redirect landing: also poll the setup token's status.
    const timer = setInterval(async () => {
      try {
        const t = await getSetupToken(pp, setupTokenId);
        if (t.status === 'APPROVED') finish('poll');
      } catch {
        /* transient; keep polling */
      }
    }, 3000);
    const timeout = setTimeout(() => finish(new Error('Timed out after 10 minutes waiting for approval.')), 10 * 60_000);
  });
}

async function main() {
  const pp = createPayPalClient();
  mkdirSync('data', { recursive: true });
  const fresh = process.argv.includes('--fresh');
  let vault: SavedVault | null = !fresh && existsSync(TOKEN_FILE) ? (JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as SavedVault) : null;

  if (vault) {
    sensitive.push(vault.paymentTokenId, vault.customerId ?? '', vault.setupTokenId);
    step(1, `Reusing saved wallet ${maskId(vault.paymentTokenId)} (pass --fresh to link a new one).`);
  } else {
    step(1, 'Creating a Vault v3 setup token (usage_type MERCHANT, no purchase)…');
    const setup = await createPayPalSetupToken(pp, {
      description: 'ALLOWANCE — agent allowance (spike S1)',
      returnUrl: `http://localhost:${PORT}/vault/return`,
      cancelUrl: `http://localhost:${PORT}/vault/cancel`,
      requestId: `spike-setup-${randomUUID()}`,
    });
    sensitive.push(setup.id, setup.customerId ?? '');
    fixture('vault-setup-token.json', setup.raw);
    console.log(`    setup token ${maskId(setup.id)} · status ${setup.status}`);
    console.log('\n    ┌──────────────────────────────────────────────────────────────────────');
    console.log('    │ Open this link and log in with your US sandbox PERSONAL account:');
    console.log(`    │ ${setup.approveUrl}`);
    console.log('    │ (Developer Dashboard → Testing Tools → Sandbox Accounts → the Personal');
    console.log('    │  account → View/Edit shows its email and password.) Then click Agree/Continue.');
    console.log('    └──────────────────────────────────────────────────────────────────────');

    step(2, 'Waiting for your approval in PayPal (redirect or status poll)…');
    const how = await waitForApproval(pp, setup.id);
    console.log(`    approved (detected by ${how})`);

    step(3, 'Creating the payment token (the saved wallet)…');
    const token = await createPaymentToken(pp, setup.id, `spike-ptoken-${setup.id}`);
    sensitive.push(token.id, token.customerId ?? '');
    fixture('vault-payment-token.json', token.raw);
    vault = { paymentTokenId: token.id, customerId: token.customerId, setupTokenId: setup.id, createdAt: new Date().toISOString() };
    writeFileSync(TOKEN_FILE, JSON.stringify(vault, null, 2) + '\n', { mode: 0o600 });
    console.log(`    payment token ${maskId(token.id)} · customer ${maskId(token.customerId)} → saved to ${TOKEN_FILE}`);
  }

  step(4, 'Charging $1.00 to the saved wallet (Orders v2, payment_source.paypal.vault_id)…');
  const decisionId = `spike-${Date.now()}`;
  const { unit, totalCents } = buildPurchaseUnit({
    referenceId: decisionId,
    customId: 'spike-mandate',
    invoiceId: decisionId,
    description: 'ALLOWANCE spike S1 test charge',
    lines: [{ name: 'ALLOWANCE test charge', sku: 'SPIKE-001', unitAmountCents: 100, quantity: 1 }],
  });
  let order = await createVaultOrder(pp, { vaultId: vault.paymentTokenId, unit, requestId: decisionId });
  fixture('order-vault-completed.json', order);
  if (order.status !== 'COMPLETED') {
    console.log(`    order ${order.id} came back ${order.status}; capturing…`);
    order = await captureOrder(pp, order.id, `capture-${decisionId}`);
    fixture('order-capture.json', order);
  }
  const capture = captureOf(order);
  if (!capture) throw new Error(`Order ${order.id} has no capture (status ${order.status}).`);
  console.log(`    order ${order.id} · ${order.status} · capture ${capture.id} · ${capture.status} · ${formatUsd(capture.amountCents || totalCents)}`);

  step(5, 'Idempotency: re-sending the same order with the same PayPal-Request-Id…');
  const replay = await createVaultOrder(pp, { vaultId: vault.paymentTokenId, unit, requestId: decisionId });
  const sameOrder = replay.id === order.id;
  console.log(`    ${sameOrder ? '✓ same order returned — no double charge' : `✗ PayPal created a second order ${replay.id}`}`);

  step(6, 'Undo: refunding the capture (POST /v2/payments/captures/{id}/refund)…');
  const refund = await refundCapture(pp, capture.id, { requestId: `undo-${decisionId}`, noteToPayer: 'Undone in ALLOWANCE (spike S1)' });
  fixture('refund-completed.json', refund);
  console.log(`    refund ${refund.id} · ${refund.status}`);
  if (!sameOrder) {
    const extra = captureOf(replay);
    if (extra) {
      const r2 = await refundCapture(pp, extra.id, { requestId: `undo-${decisionId}-dup`, noteToPayer: 'Undone in ALLOWANCE (spike duplicate)' });
      console.log(`    refunded the duplicate too: ${r2.id} · ${r2.status}`);
    }
  }

  console.log('\nS1 RESULT');
  console.log(`  vault token   ${maskId(vault.paymentTokenId)}`);
  console.log(`  order         ${order.id} (${order.status})`);
  console.log(`  capture       ${capture.id} (${capture.status})`);
  console.log(`  refund        ${refund.id} (${refund.status})`);
  console.log(`  idempotent    ${sameOrder ? 'yes' : 'NO'}`);
  console.log(`  fixtures      ${FIXTURES}/ (redacted)`);
  console.log('\nPayPal request log (no bodies):');
  for (const e of pp.log()) console.log(`  ${e.method.padEnd(6)} ${e.path.padEnd(52)} ${e.status} ${e.durationMs}ms${e.debugId ? ` debug_id=${e.debugId}` : ''}`);
}

main().catch((e) => {
  console.error(`\nS1 FAILED: ${(e as Error).message}`);
  process.exitCode = 1;
});
