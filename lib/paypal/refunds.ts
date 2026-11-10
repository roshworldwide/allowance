// Undo = a real PayPal refund of the original capture, idempotent on `undo-<decisionId>`.
import type { PayPalClient } from './client';
import { centsToValue, valueToCents, type Money } from './money';

export type Refund = {
  id: string;
  status: 'CANCELLED' | 'FAILED' | 'PENDING' | 'COMPLETED' | (string & {});
  amount?: Money;
  create_time?: string;
};

export async function refundCapture(
  pp: PayPalClient,
  captureId: string,
  input: { requestId: string; amountCents?: number; noteToPayer?: string; invoiceId?: string },
) {
  const refund = await pp.post<Refund>(
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {
      ...(input.amountCents !== undefined ? { amount: { currency_code: 'USD', value: centsToValue(input.amountCents) } } : {}),
      ...(input.invoiceId ? { invoice_id: input.invoiceId.slice(0, 127) } : {}),
      note_to_payer: (input.noteToPayer ?? 'Undone in ALLOWANCE').slice(0, 255),
    },
    { requestId: input.requestId },
  );
  return { ...refund, amountCents: refund.amount ? valueToCents(refund.amount.value) : input.amountCents };
}

export function getRefund(pp: PayPalClient, refundId: string) {
  return pp.get<Refund>(`/v2/payments/refunds/${encodeURIComponent(refundId)}`);
}
