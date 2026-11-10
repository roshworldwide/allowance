// GET /api/allowance/vault/return — PayPal redirects here after the person approves saving their wallet.
// PayPal appends approval_token_id (the setup token). We upgrade it to a payment token and go back.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { publicBaseUrl } from '@/lib/allowance/context';
import { completeVaultLink } from '@/lib/allowance/mandates';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const setupTokenId = req.nextUrl.searchParams.get('approval_token_id') ?? req.nextUrl.searchParams.get('token');
  const base = publicBaseUrl();
  if (!setupTokenId || !/^[A-Za-z0-9_-]{6,64}$/.test(setupTokenId)) return NextResponse.redirect(`${base}/errand?link=invalid`);
  try {
    await completeVaultLink(setupTokenId);
    return NextResponse.redirect(`${base}/errand?link=ok`);
  } catch {
    return NextResponse.redirect(`${base}/errand?link=failed`);
  }
}
