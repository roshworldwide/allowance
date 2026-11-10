// Mobile step-up page (the QR target). The approval itself happens in PayPal; this page explains what
// is being asked and why, then confirms the capture when PayPal sends the person back.
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { ApproveView } from '@/components/approve/ApproveView';
import { ctx } from '@/lib/allowance/context';
import { getApproval, getDecision, getMandate, ruleResults } from '@/lib/store/repo';

export const metadata: Metadata = { title: 'Approve purchase' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0a0f1e' };
export const dynamic = 'force-dynamic';

export default async function ApprovePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^apr_[a-f0-9]{8,40}$/.test(id)) notFound();
  const { db, world } = ctx();
  const a = getApproval(db, id);
  if (!a) notFound();
  const d = getDecision(db, a.decision_id)!;
  const item = d.sku ? world.registry.item(d.sku) : undefined;
  const reasons = ruleResults(db, d.id)
    .filter((r) => r.outcome === 'STEP_UP')
    .map((r) => r.detail.split(' — ').pop() ?? r.detail);
  return (
    <ApproveView
      approvalId={a.id}
      initialStatus={a.status}
      approveUrl={a.status === 'PENDING' ? a.approve_url : null}
      returned={q.paypal === 'approved' ? 'approved' : q.paypal === 'cancelled' ? 'cancelled' : null}
      item={item?.name ?? d.sku ?? 'Purchase'}
      qty={d.qty ?? 1}
      amountCents={d.amount_cents}
      merchant={item ? (world.registry.merchant(item.merchantId)?.name ?? '') : ''}
      reasons={reasons}
      allowance={getMandate(db, d.mandate_id)?.mandate.name ?? 'Your allowance'}
    />
  );
}
