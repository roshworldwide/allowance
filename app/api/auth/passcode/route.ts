// POST /api/auth/passcode { passcode } → sets the httpOnly live-mode session cookie.
import { NextResponse } from 'next/server';
import { clientIp, issueSession, passcodeMatches, rateLimit, SESSION_COOKIE } from '@/lib/security/access';
import { readJsonObject } from '@/lib/security/body';

export async function POST(req: Request) {
  const rl = rateLimit('auth', clientIp(req));
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  const body = await readJsonObject(req, 4_096);
  if (body.tooLarge) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  const passcode = body.value?.passcode;
  if (typeof passcode !== 'string' || passcode.length > 200 || !passcodeMatches(passcode)) {
    return NextResponse.json({ error: 'Wrong passcode' }, { status: 401 });
  }
  const s = issueSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: s.maxAgeSec });
  return res;
}
