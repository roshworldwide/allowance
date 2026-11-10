// The live money path end to end against a fake PayPal sandbox (fetch stub speaking the real endpoints).
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyChain } from '@/lib/guard';
import { createPayPalClient } from '@/lib/paypal/client';
import type { ResponsesClient } from '@/lib/agent/loop';

process.env.PAYPAL_ENV = 'sandbox';
process.env.ALLOWANCE_DB_PATH = ':memory:';
process.env.DEMO_VAULT_TOKEN_ID = 'vaulttoken_fake_8k2a';
process.env.DEMO_VAULT_CUSTOMER_ID = 'customer_fake_77';
process.env.PUBLIC_BASE_URL = 'https://allowance.example';

// ---- fake PayPal sandbox ----------------------------------------------------------------------------
type O = { id: string; status: string; vault: boolean; amount: string; captureId?: string };
const orders = new Map<string, O>();
const byRequestId = new Map<string, unknown>();
const calls: string[] = [];
let n = 0;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'paypal-debug-id': `dbg${++n}` } });
const orderJson = (o: O) => ({
  id: o.id,
  status: o.status,
  links: o.vault ? [] : [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${o.id}` }],
  purchase_units: [{ payments: o.captureId ? { captures: [{ id: o.captureId, status: 'COMPLETED', amount: { currency_code: 'USD', value: o.amount } }] } : undefined }],
});
const fakeFetch: typeof fetch = async (url, init) => {
  const u = new URL(String(url));
  const method = init?.method ?? 'GET';
  const rid = (init?.headers as Record<string, string> | undefined)?.['PayPal-Request-Id'];
  calls.push(`${method} ${u.pathname}`);
  if (u.pathname === '/v1/oauth2/token') return json(200, { access_token: 'A21_fake', expires_in: 32400 });
  if (rid && byRequestId.has(rid)) return json(200, byRequestId.get(rid));
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  let res: unknown;
  if (method === 'POST' && u.pathname === '/v2/checkout/orders') {
    const vault = Boolean(body.payment_source?.paypal?.vault_id);
    const o: O = { id: `ORDER${++n}`, status: vault ? 'COMPLETED' : 'PAYER_ACTION_REQUIRED', vault, amount: body.purchase_units[0].amount.value };
    if (vault) o.captureId = `CAP${++n}`;
    orders.set(o.id, o);
    res = orderJson(o);
  } else if (method === 'GET' && u.pathname.startsWith('/v2/checkout/orders/')) {
    res = orderJson(orders.get(u.pathname.split('/').pop()!)!);
  } else if (method === 'POST' && u.pathname.endsWith('/capture')) {
    const o = orders.get(u.pathname.split('/')[4]!)!;
    o.status = 'COMPLETED';
    o.captureId ??= `CAP${++n}`;
    res = orderJson(o);
  } else if (method === 'POST' && u.pathname.endsWith('/refund')) {
    res = { id: `REF${++n}`, status: 'COMPLETED', amount: body.amount };
  } else return json(404, { name: 'RESOURCE_NOT_FOUND' });
  if (rid) byRequestId.set(rid, res);
  return json(201, res);
};

function scripted(steps: [string, object][]): ResponsesClient {
  let i = 0;
  return {
    responses: {
      async create() {
        const s = steps[i++];
        if (!s) return { id: `r${i}`, output: [], output_text: 'Done: cables bought, hub blocked, lamp waiting for your approval.', usage: { input_tokens: 50, output_tokens: 20 } };
        return { id: `r${i}`, output: [{ type: 'function_call', call_id: `c${i}`, name: s[0], arguments: JSON.stringify(s[1]) }], usage: { input_tokens: 100, output_tokens: 20 } };
      },
    },
  };
}

describe('live money path (fake PayPal sandbox)', async () => {
  const { ctx } = await import('@/lib/allowance/context');
  const { createMandate } = await import('@/lib/allowance/mandates');
  const { startLiveRun } = await import('@/lib/allowance/run');
  const { pollApprovals, undoPurchase, UndoError } = await import('@/lib/allowance/executor');
  const repo = await import('@/lib/store/repo');

  beforeAll(() => {
    ctx().paypal = () => paypalFake;
  });
  const paypalFake = createPayPalClient({ clientId: 'id', clientSecret: 'secret', fetchImpl: fakeFetch, sleep: async () => {} });

  it('runs the demo errand: ALLOW pays from the vault, BLOCK stops the hub, STEP_UP waits for PayPal approval', async () => {
    const sm = createMandate({ sessionId: 's1' });
    expect(sm.mandate.status).toBe('ACTIVE');
    const contract = {
      id: 'tc_live',
      mandateId: sm.mandate.id,
      confirmedAt: new Date().toISOString(),
      lines: [
        { id: 'L1', category: 'electronics', productType: 'usb-c-cable', description: 'USB-C cable', maxQty: 2, maxUnitCents: 1500 },
        { id: 'L2', category: 'office-supplies', productType: 'desk-lamp', description: 'Desk lamp', maxQty: 1, maxUnitCents: 5000 },
      ],
    };
    repo.insertContract(ctx().db, contract, 'Get me two USB-C cables under $15 each and a desk lamp under $50.');
    const events: string[] = [];
    const r = await startLiveRun({
      mandateId: sm.mandate.id,
      contractId: contract.id,
      model: 'scripted',
      onEvent: (e) => events.push(e.type),
      client: scripted([
        ['view_product', { sku: 'VW-CBL-USBC-1M' }],
        ['allowance_checkout', { sku: 'VW-CBL-USBC-1M', qty: 2, contractLineId: 'L1', quotedUnitCents: 1199 }],
        ['allowance_checkout', { sku: 'VW-HUB-USBC-7', qty: 1, contractLineId: 'L1', quotedUnitCents: 3400 }],
        ['allowance_checkout', { sku: 'NW-LAMP-LED', qty: 1, contractLineId: 'L2', quotedUnitCents: 4800 }],
        ['create_refund', { capture_id: 'CAP1234567890ABCDE' }],
      ]),
    });
    expect(r.stopReason).toBe('final');
    expect(r.verdicts.map((v) => `${v.verdict.verdict}${v.verdict.firstBlock ? ':' + v.verdict.firstBlock : ''}`)).toEqual(['ALLOW', 'BLOCK:R02', 'STEP_UP', 'BLOCK:R12']);
    expect(events).toContain('verdict');

    const db = ctx().db;
    const [cables, , lamp] = r.verdicts.map((v) => v.verdict.decisionId);
    expect(repo.getPurchase(db, cables!)).toMatchObject({ status: 'COMPLETED', path: 'VAULT', amount_cents: 2398 });
    expect(repo.getDecision(db, lamp!)?.status).toBe('PENDING_APPROVAL');
    expect(ctx().ledger.totals(sm.mandate.id)).toEqual({ committedCents: 2398, reservedCents: 4800 });
    // The agent's toolkit refund attempt never reached PayPal.
    expect(calls.filter((c) => c.endsWith('/refund'))).toHaveLength(0);

    // The person approves on their phone; the poller captures (not dependent on the redirect landing).
    const approval = repo.pendingApprovals(db)[0]!;
    orders.get(approval.order_id!)!.status = 'APPROVED';
    await pollApprovals();
    expect(repo.getApproval(db, approval.id)?.status).toBe('CAPTURED');
    expect(ctx().ledger.totals(sm.mandate.id)).toEqual({ committedCents: 2398 + 4800, reservedCents: 0 });

    // One-click undo on the cables: a real refund, the budget comes back; a second click is idempotent.
    const undo = await undoPurchase(cables!);
    expect(undo).toMatchObject({ status: 'COMPLETED', alreadyDone: false });
    expect(ctx().ledger.totals(sm.mandate.id).committedCents).toBe(4800);
    expect((await undoPurchase(cables!)).alreadyDone).toBe(true);
    await expect(undoPurchase(r.verdicts[1]!.verdict.decisionId)).rejects.toBeInstanceOf(UndoError);

    // Every decision, capture and refund is on the hash chain, and the chain verifies.
    const chain = ctx().chain.all();
    expect(chain.map((e) => e.type)).toEqual(expect.arrayContaining(['mandate.created', 'decision', 'capture', 'refund']));
    expect(verifyChain(chain).ok).toBe(true);
  });

  it('idempotency: replaying a decision id returns the same PayPal order (no double charge)', async () => {
    const { createVaultOrder, buildPurchaseUnit } = await import('@/lib/paypal/orders');
    const { unit } = buildPurchaseUnit({ referenceId: 'dec_x', customId: 'm', invoiceId: 'dec_x', description: 'x', lines: [{ name: 'x', sku: 'X', unitAmountCents: 100, quantity: 1 }] });
    const a = await createVaultOrder(paypalFake, { vaultId: 'v', unit, requestId: 'dec_x' });
    const b = await createVaultOrder(paypalFake, { vaultId: 'v', unit, requestId: 'dec_x' });
    expect(b.id).toBe(a.id);
  });
});
