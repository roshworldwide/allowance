// GET /api/studio/data → the Control Room tables (no secrets: sandbox ids, masked tokens, no payer data).
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, liveAccess } from '@/lib/security/access';
import { controlRoomData } from '@/lib/studio/server-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = liveAccess(req.cookies.get(SESSION_COOKIE)?.value);
  const { data, sample } = await controlRoomData(access.ok ? access.sessionId : undefined);
  return NextResponse.json({ ...data, sample }, { headers: { 'Cache-Control': 'no-store' } });
}
