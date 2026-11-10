// PayPal webhooks: register (after deploy) and verify every event with PayPal's own verification API.
// Docs: https://developer.paypal.com/api/webhooks/overview (POST /v1/notifications/verify-webhook-signature)
import type { PayPalClient } from './client';

export const WEBHOOK_EVENTS = [
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.DENIED',
  'VAULT.PAYMENT-TOKEN.CREATED',
  'VAULT.PAYMENT-TOKEN.DELETED',
] as const;

export type WebhookEvent = { id: string; event_type: string; resource_type?: string; summary?: string; resource?: Record<string, unknown> };

const HEADERS = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'] as const;

/** True only if PayPal confirms the signature for our webhook id. */
export async function verifyWebhook(pp: PayPalClient, headers: Headers, event: WebhookEvent, webhookId: string): Promise<boolean> {
  const h = Object.fromEntries(HEADERS.map((k) => [k, headers.get(k)]));
  if (HEADERS.some((k) => !h[k])) return false;
  const res = await pp.post<{ verification_status: string }>(
    '/v1/notifications/verify-webhook-signature',
    {
      auth_algo: h['paypal-auth-algo'],
      cert_url: h['paypal-cert-url'],
      transmission_id: h['paypal-transmission-id'],
      transmission_sig: h['paypal-transmission-sig'],
      transmission_time: h['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: event,
    },
    { requestId: `verify-${h['paypal-transmission-id']}` },
  );
  return res.verification_status === 'SUCCESS';
}

export async function createWebhook(pp: PayPalClient, url: string) {
  return pp.post<{ id: string; url: string }>('/v1/notifications/webhooks', { url, event_types: WEBHOOK_EVENTS.map((name) => ({ name })) }, { requestId: `webhook-${url}` });
}

export async function listWebhooks(pp: PayPalClient) {
  return (await pp.get<{ webhooks: { id: string; url: string }[] }>('/v1/notifications/webhooks')).webhooks ?? [];
}
