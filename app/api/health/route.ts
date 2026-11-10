// GET /api/health — sandbox mode, DB, PayPal token, OpenAI configured. Booleans only, never secrets.
import { NextResponse } from 'next/server';
import { isSandbox } from '@/lib/paypal/sandbox-guard';

export const dynamic = 'force-dynamic';

let paypalCheck: { ok: boolean; at: number } | undefined;

export async function GET() {
  const sandbox = isSandbox();
  let db: 'ok' | 'error' = 'ok';
  try {
    const { getDb } = await import('@/lib/store/db');
    getDb().prepare('select 1').get();
  } catch {
    db = 'error';
  }

  let paypal: 'ok' | 'error' | 'unconfigured' = 'unconfigured';
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && sandbox) {
    // Cache the credential check for 5 minutes so health probes don't hammer PayPal.
    if (!paypalCheck || Date.now() - paypalCheck.at > 5 * 60_000) {
      const { paypal: client } = await import('@/lib/paypal/client');
      paypalCheck = { ok: await client().checkCredentials(), at: Date.now() };
    }
    paypal = paypalCheck.ok ? 'ok' : 'error';
  }

  const body = {
    ok: sandbox && db === 'ok',
    sandbox,
    db,
    paypal,
    openai: process.env.AG_STUDIO_OPENAI_API_KEY ? 'configured' : 'unconfigured',
    studioLicence: process.env.AG_STUDIO ? 'configured' : 'unconfigured',
    ownerMode: process.env.OWNER_MODE === 'true',
    at: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
