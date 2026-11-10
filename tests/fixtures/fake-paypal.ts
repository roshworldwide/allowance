// A fake PayPal sandbox: a fetch stub that speaks the real endpoints ALLOWANCE uses (OAuth, Orders v2
// vault + approval orders, capture, refund) with PayPal-Request-Id idempotency. Tests and previews only.
import type { ResponsesClient } from '@/lib/agent/loop';

export function fakePayPal() {
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
  return { fetch: fakeFetch, orders, calls };
}

export function scripted(steps: [string, object][]): ResponsesClient {
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

