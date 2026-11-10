// GET /api/studio/data → the Control Room tables (no secrets: sandbox ids, masked tokens, no payer data).
import { NextResponse } from 'next/server';
import { controlRoomData } from '@/lib/studio/server-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, sample } = controlRoomData();
  return NextResponse.json({ ...data, sample }, { headers: { 'Cache-Control': 'no-store' } });
}
