// POST /api/webhooks/paypal — PayPal events, each verified with PayPal's verification API before use.
// Reconciles: captures → "PayPal confirmed ✓", refunds, approvals (capture right away), vault token deletes.
import { NextResponse } from 'next/server';
import { ctx, emit } from '@/lib/allowance/context';
import { pollApprovals } from '@/lib/allowance/executor';
import { verifyWebhook, type WebhookEvent } from '@/lib/paypal/webhooks';
import { clientIp, rateLimit } from '@/lib/security/access';
import { readJsonObject } from '@/lib/security/body';
import { markPayPalConfirmed, setMandateStatus } from '@/lib/store/repo';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Public endpoint: each request costs a PayPal verification call and a row, so it is rate-limited
  // per IP (far above PayPal's own delivery rate) and never reads more than 200 KB.
  const rl = rateLimit('webhook', clientIp(req));
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return NextResponse.json({ ok: false }, { status: 400 });
  const body = await readJsonObject(req, 200_000);
  if (body.tooLarge) return NextResponse.json({ ok: false }, { status: 413 });
  if (!body.value || typeof body.value.id !== 'string' || typeof body.value.event_type !== 'string') return NextResponse.json({ ok: false }, { status: 400 });
  const event = body.value as unknown as WebhookEvent;
  const { db, paypal, chain } = ctx();
  let verified = false;
  try {
    verified = await verifyWebhook(paypal(), req.headers, event, webhookId);
  } catch {
    verified = false;
  }
  const r = event.resource ?? {};
  const resourceId = typeof r.id === 'string' ? r.id : null;
  db.prepare('INSERT OR IGNORE INTO webhook_events (id, event_type, resource_id, verified, received_at, summary) VALUES (?,?,?,?,?,?)').run(event.id, event.event_type, resourceId, +verified, new Date().toISOString(), (event.summary ?? '').slice(0, 200));
  if (!verified) return NextResponse.json({ ok: false, verified: false }, { status: 401 });

  chain.record('webhook', { id: event.id, type: event.event_type, resourceId });
  switch (event.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      if (resourceId) markPayPalConfirmed(db, { captureId: resourceId });
      break;
    case 'CHECKOUT.ORDER.APPROVED':
      void pollApprovals(); // capture the step-up now, without waiting for the next tick
      break;
    case 'VAULT.PAYMENT-TOKEN.DELETED':
      if (resourceId) {
        const rows = db.prepare("SELECT id FROM mandates WHERE vault_token_ref = ? AND status = 'ACTIVE'").all(resourceId) as { id: string }[];
        for (const m of rows) setMandateStatus(db, m.id, 'REVOKED', true);
      }
      break;
  }
  const mandate = resourceId ? (db.prepare('SELECT d.mandate_id AS m FROM purchases p JOIN decisions d ON d.id = p.decision_id WHERE p.capture_id = ? OR p.order_id = ?').get(resourceId, resourceId) as { m: string } | undefined) : undefined;
  if (mandate) emit({ mandateId: mandate.m, type: 'webhook', data: { type: event.event_type, resourceId, verified: true } });
  return NextResponse.json({ ok: true });
}
