// Orders v2. Two ways an ALLOWANCE purchase is paid:
//   1. ALLOW   → createVaultOrder: payment_source.paypal.vault_id, completes without the payer present.
//   2. STEP_UP → createApprovalOrder: a normal checkout the human approves in PayPal (QR → phone).
// Purchase units are always built by the server from the trusted catalog registry, never from agent
// arguments, and every POST carries the decision id as its PayPal-Request-Id.
import type { PayPalClient } from './client';
import { centsToValue, valueToCents, type Money } from './money';

type Link = { href: string; rel: string; method?: string };

export type OrderStatus = 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED' | (string & {});

export type Capture = {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED' | (string & {});
  amount?: Money;
  create_time?: string;
};

export type Order = {
  id: string;
  status: OrderStatus;
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    invoice_id?: string;
    amount?: Money;
    payments?: { captures?: Capture[] };
  }[];
  links?: Link[];
};

export type OrderLine = {
  name: string;
  sku: string;
  unitAmountCents: number;
  quantity: number;
  kind?: 'PHYSICAL_GOODS' | 'DIGITAL_GOODS';
};

export type PurchaseUnitInput = {
  referenceId: string; // decision id
  customId: string; // mandate id
  invoiceId: string; // decision id (PayPal enforces invoice_id uniqueness: a second line of defence)
  description: string;
  lines: OrderLine[];
};

export function buildPurchaseUnit(input: PurchaseUnitInput) {
  if (input.lines.length === 0) throw new Error('A purchase needs at least one line.');
  let totalCents = 0;
  const items = input.lines.map((l) => {
    if (!Number.isSafeInteger(l.quantity) || l.quantity < 1) throw new RangeError(`Bad quantity for ${l.sku}`);
    totalCents += l.unitAmountCents * l.quantity;
    return {
      name: l.name.slice(0, 127),
      sku: l.sku.slice(0, 127),
      quantity: String(l.quantity),
      unit_amount: { currency_code: 'USD', value: centsToValue(l.unitAmountCents) },
      category: l.kind ?? 'PHYSICAL_GOODS',
    };
  });
  return {
    unit: {
      reference_id: input.referenceId.slice(0, 256),
      custom_id: input.customId.slice(0, 127),
      invoice_id: input.invoiceId.slice(0, 127),
      description: input.description.slice(0, 127),
      amount: {
        currency_code: 'USD',
        value: centsToValue(totalCents),
        breakdown: { item_total: { currency_code: 'USD', value: centsToValue(totalCents) } },
      },
      items,
    },
    totalCents,
  };
}

/** ALLOW path: charge the saved wallet. Expect COMPLETED with a capture. */
export async function createVaultOrder(pp: PayPalClient, input: { vaultId: string; unit: ReturnType<typeof buildPurchaseUnit>['unit']; requestId: string }) {
  return pp.post<Order>(
    '/v2/checkout/orders',
    {
      intent: 'CAPTURE',
      purchase_units: [input.unit],
      payment_source: { paypal: { vault_id: input.vaultId } },
    },
    { requestId: input.requestId },
  );
}

/** STEP_UP path: a normal checkout the human approves in PayPal. Return/cancel URLs must be absolute. */
export async function createApprovalOrder(
  pp: PayPalClient,
  input: { unit: ReturnType<typeof buildPurchaseUnit>['unit']; returnUrl: string; cancelUrl: string; requestId: string; brandName?: string },
) {
  const order = await pp.post<Order>(
    '/v2/checkout/orders',
    {
      intent: 'CAPTURE',
      purchase_units: [input.unit],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: (input.brandName ?? 'ALLOWANCE (sandbox)').slice(0, 127),
            locale: 'en-US',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
    { requestId: input.requestId },
  );
  // With payment_source.paypal the approval link is rel "payer-action"; older flows use "approve".
  const approveUrl = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (!approveUrl) throw new Error(`Order ${order.id} has no approval link (status ${order.status}).`);
  return { order, approveUrl };
}

export function getOrder(pp: PayPalClient, id: string) {
  return pp.get<Order>(`/v2/checkout/orders/${encodeURIComponent(id)}`);
}

export function captureOrder(pp: PayPalClient, id: string, requestId: string) {
  return pp.post<Order>(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, { requestId });
}

/** The (single) capture of an order, with its amount in cents. */
export function captureOf(order: Order): { id: string; status: Capture['status']; amountCents: number } | undefined {
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) return undefined;
  return { id: capture.id, status: capture.status, amountCents: capture.amount ? valueToCents(capture.amount.value) : 0 };
}
