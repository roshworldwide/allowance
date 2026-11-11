// Route-handler helpers: live-access gate, JSON errors, SSE streams.
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, clientIp, liveAccess, rateLimit } from '@/lib/security/access';
import { readJsonObject } from '@/lib/security/body';
import { latestMandateForSession } from '@/lib/store/repo';
import { ctx } from './context';

export const jsonError = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });

export type Live = { sessionId: string; owner: boolean };

/** Live mode needs the demo passcode session (or owner mode) and passes a per-IP rate limit. */
export function requireLive(req: NextRequest, bucket: 'agent' | 'allowance' = 'allowance'): Live | Response {
  const a = liveAccess(req.cookies.get(SESSION_COOKIE)?.value);
  if (!a.ok) return jsonError(401, 'Enter the demo passcode to use live mode.', { needsPasscode: true });
  const rl = rateLimit(bucket, clientIp(req));
  if (!rl.ok) return jsonError(429, `Slow down: try again in ${rl.retryAfterSec}s.`);
  return { sessionId: a.sessionId, owner: a.owner };
}

/** The session's current allowance (each live session has its own). */
export function sessionMandate(live: Live) {
  return latestMandateForSession(ctx().db, live.sessionId);
}

/** The JSON body as an object, or null when it is too large (never read past `maxBytes`), invalid or not an object. */
export async function readJson<T>(req: Request, maxBytes = 16_000): Promise<T | null> {
  const r = await readJsonObject(req, maxBytes);
  return r.tooLarge ? null : (r.value as T | null);
}

/** A Server-Sent Events response fed by `start(send)`; closes when start resolves or the client leaves. */
export function sse(req: Request, start: (send: (event: string, data: unknown) => void) => Promise<void> | void): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };
      req.signal.addEventListener('abort', () => {
        open = false;
      });
      try {
        await start(send);
      } catch (e) {
        send('error', { message: (e as Error).message.slice(0, 300) });
      } finally {
        if (open) controller.close();
        open = false;
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
