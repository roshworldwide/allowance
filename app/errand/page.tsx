import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ErrandConsole, type ErrandInitial } from '@/components/errand/ErrandConsole';
import type { PublicAllowance } from '@/components/allowance/AllowanceCard';
import { TopBar } from '@/components/ui';
import { ctx } from '@/lib/allowance/context';
import { publicMandate } from '@/lib/allowance/mandates';
import { SESSION_COOKIE, liveAccess } from '@/lib/security/access';
import { latestMandateForSession } from '@/lib/store/repo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Errand' };

const LINK_NOTICES: Record<string, string> = {
  ok: 'PayPal linked. Your allowance is active.',
  cancelled: 'Linking was cancelled in PayPal.',
  failed: 'PayPal linking failed. Try again.',
  invalid: 'PayPal linking failed. Try again.',
};

export default async function ErrandPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { link } = await searchParams;
  const access = liveAccess((await cookies()).get(SESSION_COOKIE)?.value);
  let initial: ErrandInitial = { gate: 'passcode', owner: false, allowance: null };
  if (access.ok) {
    const sm = latestMandateForSession(ctx().db, access.sessionId);
    initial = { gate: 'ready', owner: access.owner, allowance: sm ? (publicMandate(sm) as PublicAllowance) : null };
  }
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar current="errand" />
      <ErrandConsole initial={initial} initialNotice={typeof link === 'string' ? (LINK_NOTICES[link] ?? null) : null} />
    </div>
  );
}
