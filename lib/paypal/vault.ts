// Vault v3: the user's consent. Saving their PayPal wallet with usage_type MERCHANT creates the billing
// agreement an agent's allowance draws on. No purchase is made when linking.
// Docs: https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal.md
import type { PayPalClient } from './client';

type Link = { href: string; rel: string; method?: string };

export type SetupTokenStatus = 'CREATED' | 'PAYER_ACTION_REQUIRED' | 'APPROVED' | 'VAULTED' | 'TOKENIZED' | (string & {});

export type SetupToken = {
  id: string;
  status: SetupTokenStatus;
  customer?: { id: string };
  links?: Link[];
};

export type PaymentToken = {
  id: string;
  customer?: { id: string };
  payment_source?: { paypal?: { usage_type?: string; customer_type?: string; description?: string } };
  links?: Link[];
};

export type CreateSetupTokenInput = {
  description: string;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
  brandName?: string;
  customerId?: string;
};

export async function createPayPalSetupToken(pp: PayPalClient, input: CreateSetupTokenInput) {
  assertAbsolute(input.returnUrl, 'returnUrl');
  assertAbsolute(input.cancelUrl, 'cancelUrl');
  const token = await pp.post<SetupToken>(
    '/v3/vault/setup-tokens',
    {
      ...(input.customerId ? { customer: { id: input.customerId } } : {}),
      payment_source: {
        paypal: {
          description: input.description.slice(0, 127),
          usage_type: 'MERCHANT',
          customer_type: 'CONSUMER',
          usage_pattern: 'IMMEDIATE',
          permit_multiple_payment_tokens: false,
          experience_context: {
            brand_name: (input.brandName ?? 'ALLOWANCE (sandbox)').slice(0, 127),
            locale: 'en-US',
            shipping_preference: 'NO_SHIPPING',
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
    { requestId: input.requestId },
  );
  const approveUrl = token.links?.find((l) => l.rel === 'approve')?.href;
  if (!approveUrl) throw new Error(`Setup token ${token.id} has no approve link (status ${token.status}).`);
  return { id: token.id, status: token.status, customerId: token.customer?.id, approveUrl, raw: token };
}

export function getSetupToken(pp: PayPalClient, id: string) {
  return pp.get<SetupToken>(`/v3/vault/setup-tokens/${encodeURIComponent(id)}`);
}

/** Upgrades an approved setup token into a reusable payment token (the saved wallet). */
export async function createPaymentToken(pp: PayPalClient, setupTokenId: string, requestId: string) {
  const token = await pp.post<PaymentToken>(
    '/v3/vault/payment-tokens',
    { payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } },
    { requestId },
  );
  return { id: token.id, customerId: token.customer?.id, raw: token };
}

export function getPaymentToken(pp: PayPalClient, id: string) {
  return pp.get<PaymentToken>(`/v3/vault/payment-tokens/${encodeURIComponent(id)}`);
}

/** Kill switch: revoke the saved wallet at PayPal. Owner mode only (see lib/allowance). */
export function deletePaymentToken(pp: PayPalClient, id: string) {
  return pp.delete(`/v3/vault/payment-tokens/${encodeURIComponent(id)}`);
}

function assertAbsolute(url: string, name: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${name} must be an absolute URL (PayPal rejects relative ones): ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(`${name} must be http(s): ${url}`);
}
