// Dev only: records a SYNTHETIC replay (fake PayPal, scripted agent) to preview the Errand UI before
// real keys exist. Written to tests/fixtures/replay-preview.json with synthetic: true; the replay page
// never shows it as a sandbox run (only /replay?preview=1 in development).
process.env.PAYPAL_ENV = 'sandbox';
process.env.ALLOWANCE_DB_PATH = ':memory:';
process.env.DEMO_VAULT_TOKEN_ID = 'vaulttoken_preview_8k2a';
process.env.DEMO_VAULT_CUSTOMER_ID = 'customer_preview';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.AG_STUDIO_OPENAI_API_KEY = '';

import { createPayPalClient } from '../lib/paypal/client';
import { fakePayPal, scripted } from '../tests/fixtures/fake-paypal';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { ctx } = await import('../lib/allowance/context');
  const { createMandate } = await import('../lib/allowance/mandates');
  const { startLiveRun } = await import('../lib/allowance/run');
  const { pollApprovals, undoPurchase } = await import('../lib/allowance/executor');
  const { startRecording } = await import('../lib/allowance/recorder');
  const repo = await import('../lib/store/repo');

  const fake = fakePayPal();
  ctx().paypal = () => createPayPalClient({ clientId: 'x', clientSecret: 'y', fetchImpl: fake.fetch, sleep: async () => {} });
  const sm = createMandate({ sessionId: 'preview' });
  const task = 'Get me two USB-C cables under $15 each and a desk lamp under $50.';
  const contract = {
    id: 'tc_preview',
    mandateId: sm.mandate.id,
    confirmedAt: new Date().toISOString(),
    lines: [
      { id: 'L1', category: 'electronics', productType: 'usb-c-cable', description: 'USB-C cable', maxQty: 2, maxUnitCents: 1500 },
      { id: 'L2', category: 'office-supplies', productType: 'desk-lamp', description: 'Desk lamp', maxQty: 1, maxUnitCents: 5000 },
    ],
  };
  repo.insertContract(ctx().db, contract, task);
  const rec = startRecording({
    mandateId: sm.mandate.id,
    dir: 'tests/fixtures',
    fileName: 'replay-preview.json',
    meta: { task, model: 'scripted preview', contract, mandate: sm.mandate, allowance: { name: sm.mandate.name, budgetCents: sm.mandate.budgetCents, perPurchaseCapCents: sm.mandate.perPurchaseCapCents, stepUpAboveCents: sm.mandate.stepUpAboveCents }, synthetic: true, note: 'Synthetic preview for UI development: scripted agent, fake PayPal.' },
  });
  const base = scripted([
    ['search_catalog', { query: 'usb-c cable' }],
    ['view_product', { sku: 'VW-CBL-USBC-1M' }],
    ['allowance_checkout', { sku: 'VW-CBL-USBC-1M', qty: 2, contractLineId: 'L1', quotedUnitCents: 1199 }],
    ['allowance_checkout', { sku: 'VW-HUB-USBC-7', qty: 1, contractLineId: 'L1', quotedUnitCents: 3400 }],
    ['search_catalog', { query: 'desk lamp' }],
    ['allowance_checkout', { sku: 'NW-LAMP-LED', qty: 1, contractLineId: 'L2', quotedUnitCents: 4800 }],
  ]);
  const slow = { responses: { create: async (b: Record<string, unknown>) => (await sleep(900), base.responses.create(b)) } };
  const r = await startLiveRun({ mandateId: sm.mandate.id, contractId: contract.id, model: 'scripted preview', client: slow, onEvent: (e) => rec.run(e.type, e) });
  rec.run('done', { runId: r.runId, stopReason: r.stopReason });
  await sleep(2500);
  const approval = repo.pendingApprovals(ctx().db)[0]!;
  fake.orders.get(approval.order_id!)!.status = 'APPROVED';
  await pollApprovals();
  await sleep(2500);
  await undoPurchase(r.verdicts[0]!.verdict.decisionId);
  await sleep(300);
  rec.stop();
  console.log(`preview replay → ${rec.file}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
