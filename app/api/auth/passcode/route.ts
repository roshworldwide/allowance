// POST /api/auth/passcode { passcode } → sets the httpOnly live-mode session cookie.
import { NextResponse } from 'next/server';
import { clientIp, issueSession, passcodeMatches, rateLimit, SESSION_COOKIE } from '@/lib/security/access';

export async function POST(req: Request) {
  const rl = rateLimit('auth', clientIp(req));
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  const body = (await req.json().catch(() => ({}))) as { passcode?: unknown };
  if (typeof body.passcode !== 'string' || body.passcode.length > 200 || !passcodeMatches(body.passcode)) {
    return NextResponse.json({ error: 'Wrong passcode' }, { status: 401 });
  }
  const s = issueSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: s.maxAgeSec });
  return res;
}
