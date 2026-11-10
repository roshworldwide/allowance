// GET  /api/allowance → this session's allowance (or null)
// POST /api/allowance → create a fresh allowance for this session (optionally with policy overrides)
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, readJson, requireLive, sessionMandate } from '@/lib/allowance/http';
import { createMandate, publicMandate } from '@/lib/allowance/mandates';

export const dynamic = 'force-dynamic';

const Overrides = z
  .object({
    name: z.string().min(1).max(60),
    budgetCents: z.number().int().min(100).max(100_000),
    perPurchaseCapCents: z.number().int().min(100).max(100_000),
    stepUpAboveCents: z.number().int().min(0).max(100_000),
    allowedCategories: z.array(z.enum(['office-supplies', 'electronics', 'home-lighting', 'services', 'gift-cards', 'subscriptions'])).min(1),
    allowRecurring: z.boolean(),
  })
  .partial()
  .strict();

export async function GET(req: NextRequest) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  const sm = sessionMandate(live);
  return NextResponse.json({ allowance: sm ? publicMandate(sm) : null, owner: live.owner }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const live = requireLive(req);
  if (live instanceof Response) return live;
  const body = (await readJson<unknown>(req)) ?? {};
  const parsed = Overrides.safeParse(body);
  if (!parsed.success) return jsonError(400, 'Invalid allowance settings', { issues: parsed.error.issues.slice(0, 5) });
  const sm = createMandate({ sessionId: live.sessionId, preset: parsed.data });
  return NextResponse.json({ allowance: publicMandate(sm) }, { status: 201 });
}
