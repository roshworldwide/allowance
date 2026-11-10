// Transaction Search: PayPal's own record of what happened, next to ALLOWANCE's ledger.
// Constraints (PayPal docs; also noted in the official boilerplate): at most 31 days per request, no
// fractional seconds in dates, paging via page/total_pages, and new activity can take up to ~3 hours
// to appear. Docs: https://developer.paypal.com/docs/api/transaction-search/v1/
import type { PayPalClient } from './client';

type Money = { currency_code: string; value: string };
type TxnInfo = {
  transaction_id: string;
  transaction_event_code?: string;
  transaction_status?: string;
  transaction_amount?: Money;
  transaction_initiation_date?: string;
  invoice_id?: string;
  custom_field?: string;
};

export type PayPalTransaction = {
  id: string;
  at: string;
  eventCode: string;
  eventName: string;
  status: string;
  /** Signed: refunds are negative. Integer cents. */
  amountCents: number;
  currency: string;
  invoiceId: string;
  customField: string;
};

const EVENT_NAMES: Record<string, string> = {
  T0000: 'Payment received',
  T0003: 'Pre-approved payment (saved wallet)',
  T0006: 'Checkout payment',
  T0007: 'Website payment',
  T0011: 'Mobile payment',
  T1106: 'Payment reversal',
  T1107: 'Refund',
  T1201: 'Chargeback',
};
const STATUS: Record<string, string> = { S: 'Success', P: 'Pending', D: 'Denied', V: 'Reversed', F: 'Partially refunded' };

/** PayPal rejects fractional seconds: 2026-11-10T09:12:04Z. */
export const searchDate = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export function signedCents(value: string): number {
  const v = value.trim();
  const neg = v.startsWith('-');
  const m = /^-?(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return 0;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return neg ? -cents : cents;
}

export function toTransaction(t: TxnInfo): PayPalTransaction {
  const code = t.transaction_event_code ?? '';
  return {
    id: t.transaction_id,
    at: t.transaction_initiation_date ? new Date(t.transaction_initiation_date).toISOString() : '',
    eventCode: code,
    eventName: EVENT_NAMES[code] ?? code,
    status: STATUS[t.transaction_status ?? ''] ?? (t.transaction_status ?? ''),
    amountCents: t.transaction_amount ? signedCents(t.transaction_amount.value) : 0,
    currency: t.transaction_amount?.currency_code ?? '',
    invoiceId: t.invoice_id ?? '',
    customField: t.custom_field ?? '',
  };
}

/** All transactions between start and end, split into ≤ 31-day windows. */
export async function searchTransactions(pp: PayPalClient, start: Date, end: Date): Promise<PayPalTransaction[]> {
  const out: PayPalTransaction[] = [];
  const WINDOW = 31 * 86_400_000 - 1000;
  for (let from = start.getTime(); from < end.getTime(); from += WINDOW) {
    const to = Math.min(end.getTime(), from + WINDOW);
    const base = `/v1/reporting/transactions?start_date=${encodeURIComponent(searchDate(new Date(from)))}&end_date=${encodeURIComponent(searchDate(new Date(to)))}&fields=transaction_info`;
    const rows = await pp.listAll<{ transaction_info: TxnInfo }>(base, 'transaction_details', 100);
    out.push(...rows.map((r) => toTransaction(r.transaction_info)));
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
