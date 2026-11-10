// GET /api/events → SSE: live decisions, payments, approvals, refunds and explanations for this
// session's allowance (the Firewall Lane reconnects here; the Control Room listens for live data).
import type { NextRequest } from 'next/server';
import { ctx, type LiveEvent } from '@/lib/allowance/context';
import { ensureApprovalPoller } from '@/lib/allowance/executor';
import { requireLive, sessionMandate, sse } from '@/lib/allowance/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  const mandateId = sessionMandate(live)?.mandate.id;
  ensureApprovalPoller();
  return sse(req, (send) =>
    new Promise<void>((resolve) => {
      const { bus } = ctx();
      const onEvent = (e: LiveEvent) => {
        if (!mandateId || e.mandateId === mandateId) send(e.type, e);
      };
      bus.on('event', onEvent);
      send('hello', { mandateId: mandateId ?? null });
      const ping = setInterval(() => send('ping', { at: Date.now() }), 15_000);
      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        bus.off('event', onEvent);
        resolve();
      });
    }),
  );
}
