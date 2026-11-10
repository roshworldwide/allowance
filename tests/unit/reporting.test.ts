import { describe, expect, it } from 'vitest';
import { createPayPalClient } from '@/lib/paypal/client';
import { searchDate, searchTransactions, signedCents, toTransaction } from '@/lib/paypal/reporting';

process.env.PAYPAL_ENV = 'sandbox';

describe('Transaction Search helpers', () => {
  it('formats dates without fractional seconds (PayPal rejects them)', () => {
    expect(searchDate(new Date('2026-11-10T09:12:04.567Z'))).toBe('2026-11-10T09:12:04Z');
  });
  it('parses signed amounts into integer cents', () => {
    expect(signedCents('23.98')).toBe(2398);
    expect(signedCents('-23.98')).toBe(-2398);
    expect(signedCents('48')).toBe(4800);
    expect(signedCents('1.5')).toBe(150);
  });
  it('maps T-codes and statuses', () => {
    const t = toTransaction({ transaction_id: '9AB', transaction_event_code: 'T1107', transaction_status: 'S', transaction_amount: { currency_code: 'USD', value: '-23.98' }, transaction_initiation_date: '2026-11-11T10:00:00+0000', invoice_id: 'dec_1' });
    expect(t).toMatchObject({ id: '9AB', eventName: 'Refund', status: 'Success', amountCents: -2398, invoiceId: 'dec_1', at: '2026-11-11T10:00:00.000Z' });
  });
});

describe('searchTransactions', () => {
  it('splits a long range into ≤ 31-day windows and follows paging', async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      const u = new URL(String(url));
      if (u.pathname === '/v1/oauth2/token') return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 });
      seen.push(`${u.searchParams.get('start_date')}→${u.searchParams.get('end_date')} p${u.searchParams.get('page')}`);
      const page = Number(u.searchParams.get('page'));
      return new Response(JSON.stringify({ total_pages: 2, transaction_details: [{ transaction_info: { transaction_id: `${u.searchParams.get('start_date')}-${page}`, transaction_event_code: 'T0006', transaction_status: 'S', transaction_amount: { currency_code: 'USD', value: '1.00' }, transaction_initiation_date: '2026-11-01T00:00:00Z' } }] }), { status: 200 });
    };
    const pp = createPayPalClient({ clientId: 'a', clientSecret: 'b', fetchImpl, sleep: async () => {} });
    const rows = await searchTransactions(pp, new Date('2026-09-01T00:00:00Z'), new Date('2026-11-10T00:00:00Z'));
    // 70 days → 3 windows × 2 pages
    expect(seen).toHaveLength(6);
    expect(seen.every((s) => !/\.\d{3}Z/.test(s))).toBe(true);
    expect(rows).toHaveLength(6);
  });
});
