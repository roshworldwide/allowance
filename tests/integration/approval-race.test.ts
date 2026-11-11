// Concurrency: the background poller, the phone page's "check" and a PayPal webhook can all ask to
// capture the same approved step-up at the same moment. It must be captured, charged and recorded once.
import { beforeAll, describe, expect, it } from 'vitest';
import { createPayPalClient } from '@/lib/paypal/client';

process.env.PAYPAL_ENV = 'sandbox';
process.env.ALLOWANCE_DB_PATH = ':memory:';
process.env.DEMO_VAULT_TOKEN_ID = 'vaulttoken_fake_8k2a';
process.env.DEMO_VAULT_CUSTOMER_ID = 'customer_fake_77';
process.env.PUBLIC_BASE_URL = 'https://allowance.example';

import { fakePayPal, scripted } from '../fixtures/fake-paypal';
const { fetch: fakeFetch, orders, calls } = fakePayPal();

describe('approval race (fake PayPal sandbox)', async () => {
  const { ctx } = await import('@/lib/allowance/context');
  const { createMandate } = await import('@/lib/allowance/mandates');
  const { startLiveRun } = await import('@/lib/allowance/run');
  const { pollApprovals } = await import('@/lib/allowance/executor');
  const repo = await import('@/lib/store/repo');

  const paypalFake = createPayPalClient({ clientId: 'id', clientSecret: 'secret', fetchImpl: fakeFetch, sleep: async () => {} });
  beforeAll(() => {
    ctx().paypal = () => paypalFake;
  });

  it('8 simultaneous polls capture an approved step-up exactly once', async () => {
    const sm = createMandate({ sessionId: 's-race' });
    const contract = {
      id: 'tc_race',
      mandateId: sm.mandate.id,
      confirmedAt: new Date().toISOString(),
      lines: [{ id: 'L2', category: 'office-supplies', productType: 'desk-lamp', description: 'Desk lamp', maxQty: 1, maxUnitCents: 5000 }],
    };
    repo.insertContract(ctx().db, contract, 'Get me a desk lamp under $50.');
    const r = await startLiveRun({
      mandateId: sm.mandate.id,
      contractId: contract.id,
      model: 'scripted',
      onEvent: () => {},
      client: scripted([['allowance_checkout', { sku: 'NW-LAMP-LED', qty: 1, contractLineId: 'L2', quotedUnitCents: 4800 }]]),
    });
    const decisionId = r.verdicts[0]!.verdict.decisionId;
    expect(r.verdicts[0]!.verdict.verdict).toBe('STEP_UP');
    const approval = repo.pendingApprovals(ctx().db).find((a) => a.decision_id === decisionId)!;

    orders.get(approval.order_id!)!.status = 'APPROVED'; // the person approved on their phone
    const before = calls.length;
    await Promise.all(Array.from({ length: 8 }, () => pollApprovals()));

    expect(repo.getApproval(ctx().db, approval.id)?.status).toBe('CAPTURED');
    expect(ctx().ledger.totals(sm.mandate.id)).toEqual({ committedCents: 4800, reservedCents: 0 });
    expect(calls.slice(before).filter((c) => c === `POST /v2/checkout/orders/${approval.order_id}/capture`)).toHaveLength(1);
    const captures = ctx().chain.all().filter((e) => e.type === 'capture' && (JSON.parse(e.payload) as { decisionId?: string }).decisionId === decisionId);
    expect(captures).toHaveLength(1);
  });
});
