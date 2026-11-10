// GET /api/lab/latest.json | /api/lab/holdout-latest.json → the raw Attack Lab results behind every number.
import { NextResponse } from 'next/server';
import { readLab } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (file !== 'latest.json' && file !== 'holdout-latest.json') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const lab = readLab(file);
  if (!lab) return NextResponse.json({ error: 'No Attack Lab run recorded yet.' }, { status: 404 });
  return NextResponse.json(lab, { headers: { 'Cache-Control': 'no-store' } });
}
