// Real PayPal sandbox money movement for guarded verdicts, plus undo and step-up approvals.
//   ALLOW   → Orders v2 with payment_source.paypal.vault_id (payer not present), PayPal-Request-Id = decision id
//   STEP_UP → a normal checkout the person approves in PayPal (QR → phone); the server polls and captures
//   undo    → POST /v2/payments/captures/{id}/refund, PayPal-Request-Id = undo-<decision id>
// Ledger: commit on capture COMPLETED, release on failure/decline/expiry, refund frees the budget.
import 'server-only';
import type { Verdict } from '@/lib/guard';
import type { MoneyExecutor } from '@/lib/agent/errand';
import { buildPurchaseUnit, captureOf, captureOrder, createApprovalOrder, createVaultOrder, getOrder, type Order } from '@/lib/paypal/orders';
import { refundCapture } from '@/lib/paypal/refunds';
import { getApproval, getDecision, getMandate, getPurchase, getRefund, insertApproval, pendingApprovals, setApprovalStatus, setDecisionStatus, upsertPurchase, upsertRefund } from '@/lib/store/repo';
import { ctx, emit, publicBaseUrl } from './context';

const APPROVAL_TTL_MS = 20 * 60_000;

function unitFor(v: Verdict, mandateId: string) {
  const { world } = ctx();
  if (!v.binding) throw new Error(`Decision ${v.decisionId} has no catalog binding`);
  const item = world.registry.item(v.binding.sku);
  if (!item) throw new Error(`SKU ${v.binding.sku} vanished from the registry`);
  // Built by the server from the trusted registry — never from agent arguments.
  return buildPurchaseUnit({
    referenceId: v.decisionId,
    customId: mandateId,
    invoiceId: v.decisionId,
    description: `ALLOWANCE · ${item.name}`,
    lines: [{ name: item.name, sku: item.sku, unitAmountCents: item.priceMinor, quantity: v.binding.qty, kind: item.kind }],
  }).unit;
}

function settle(decisionId: string, mandateId: string, order: Order, path: 'VAULT' | 'APPROVAL' | 'FALLBACK', amountCents: number) {
  const { db, ledger, chain } = ctx();
  const cap = captureOf(order);
  const ok = cap && (cap.status === 'COMPLETED' || cap.status === 'PENDING');
  if (ok) {
    ledger.commit(decisionId);
    upsertPurchase(db, { decisionId, orderId: order.id, captureId: cap.id, status: cap.status, amountCents, path, capturedAt: new Date().toISOString() });
    setDecisionStatus(db, decisionId, 'EXECUTED');
    chain.record('capture', { decisionId, orderId: order.id, captureId: cap.id, status: cap.status, amountCents, path });
  } else {
    ledger.release(decisionId);
    upsertPurchase(db, { decisionId, orderId: order.id, status: cap?.status ?? order.status, amountCents, path });
    setDecisionStatus(db, decisionId, 'FAILED');
  }
  emit({ mandateId, type: 'purchase', data: { decisionId, orderId: order.id, captureId: cap?.id, status: ok ? 'COMPLETED' : 'FAILED', path, amountCents } });
  return { status: ok ? ('COMPLETED' as const) : ('FAILED' as const), orderId: order.id, captureId: cap?.id };
}

function failed(decisionId: string, mandateId: string, amountCents: number, path: 'VAULT' | 'APPROVAL' | 'FALLBACK', error: unknown) {
  const { db, ledger } = ctx();
  const entry = ledger.get(decisionId);
  if (entry?.status === 'RESERVED') ledger.release(decisionId);
  upsertPurchase(db, { decisionId, status: 'FAILED', amountCents, path });
  setDecisionStatus(db, decisionId, 'FAILED');
  emit({ mandateId, type: 'purchase', data: { decisionId, status: 'FAILED', error: (error as Error).message.slice(0, 200) } });
  return { status: 'FAILED' as const };
}

/** Executor for one allowance, charging the vault token bound to it. */
export function payPalExecutor(mandateId: string): MoneyExecutor {
  return {
    async purchase(v) {
      const { db, paypal } = ctx();
      const sm = getMandate(db, mandateId);
      if (!sm?.vaultTokenRef) return failed(v.decisionId, mandateId, v.amountCents, 'VAULT', new Error('No saved PayPal wallet'));
      try {
        let order = await createVaultOrder(paypal(), { vaultId: sm.vaultTokenRef, unit: unitFor(v, mandateId), requestId: v.decisionId });
        if (order.status !== 'COMPLETED') order = await captureOrder(paypal(), order.id, `capture-${v.decisionId}`);
        return settle(v.decisionId, mandateId, order, 'VAULT', v.amountCents);
      } catch (e) {
        return failed(v.decisionId, mandateId, v.amountCents, 'VAULT', e);
      }
    },
    async approval(v) {
      const { db, paypal } = ctx();
      const approvalId = `apr_${v.decisionId.replace(/^dec_/, '')}`;
      const base = publicBaseUrl();
      try {
        const { order, approveUrl } = await createApprovalOrder(paypal(), {
          unit: unitFor(v, mandateId),
          returnUrl: `${base}/approve/${approvalId}?paypal=approved`,
          cancelUrl: `${base}/approve/${approvalId}?paypal=cancelled`,
          requestId: `stepup-${v.decisionId}`,
        });
        insertApproval(db, { id: approvalId, decisionId: v.decisionId, orderId: order.id, approveUrl, mode: 'PAYPAL' });
        setDecisionStatus(db, v.decisionId, 'PENDING_APPROVAL');
        emit({ mandateId, type: 'approval', data: { approvalId, decisionId: v.decisionId, status: 'PENDING', approvePage: `${base}/approve/${approvalId}`, amountCents: v.amountCents, reasons: v.stepUpReasons } });
        return { status: 'PENDING', orderId: order.id, approveUrl };
      } catch (e) {
        return failed(v.decisionId, mandateId, v.amountCents, 'APPROVAL', e);
      }
    },
  };
}

/**
 * Captures approved step-ups. Runs on an interval and whenever the approval page reports back, so a
 * capture never depends on the phone's redirect landing. One poll at a time: the interval, the phone
 * page and a webhook asking together share the poll in flight (one PayPal capture call, not one each).
 */
export function pollApprovals(): Promise<void> {
  const g = globalThis as unknown as { __allowancePoll?: Promise<void> };
  g.__allowancePoll ??= pollApprovalsOnce().finally(() => {
    g.__allowancePoll = undefined;
  });
  return g.__allowancePoll;
}

async function pollApprovalsOnce(): Promise<void> {
  const { db, paypal, ledger } = ctx();
  for (const a of pendingApprovals(db)) {
    if (a.mode !== 'PAYPAL' || !a.order_id) continue;
    const d = getDecision(db, a.decision_id);
    if (!d) continue;
    try {
      if (Date.now() - Date.parse(a.created_at) > APPROVAL_TTL_MS) {
        if (ledger.get(d.id)?.status === 'RESERVED') ledger.release(d.id);
        setApprovalStatus(db, a.id, 'EXPIRED');
        setDecisionStatus(db, d.id, 'DECLINED');
        emit({ mandateId: d.mandate_id, type: 'approval', data: { approvalId: a.id, decisionId: d.id, status: 'EXPIRED' } });
        continue;
      }
      const order = await getOrder(paypal(), a.order_id);
      if (order.status === 'APPROVED') {
        setApprovalStatus(db, a.id, 'APPROVED');
        const captured = await captureOrder(paypal(), order.id, `capture-${d.id}`);
        const r = settle(d.id, d.mandate_id, captured, 'APPROVAL', d.amount_cents);
        setApprovalStatus(db, a.id, r.status === 'COMPLETED' ? 'CAPTURED' : 'FAILED');
        emit({ mandateId: d.mandate_id, type: 'approval', data: { approvalId: a.id, decisionId: d.id, status: r.status === 'COMPLETED' ? 'CAPTURED' : 'FAILED' } });
      } else if (order.status === 'COMPLETED' && !getPurchase(db, d.id)?.capture_id) {
        settle(d.id, d.mandate_id, order, 'APPROVAL', d.amount_cents);
        setApprovalStatus(db, a.id, 'CAPTURED');
      }
    } catch {
      /* transient PayPal error: try again next tick */
    }
  }
}

/** Human-only: decline a step-up (releases the held amount). */
export function declineApproval(approvalId: string) {
  const { db, ledger } = ctx();
  const a = getApproval(db, approvalId);
  if (!a || (a.status !== 'PENDING' && a.status !== 'APPROVED')) throw new Error('This approval is no longer pending.');
  const d = getDecision(db, a.decision_id)!;
  if (ledger.get(d.id)?.status === 'RESERVED') ledger.release(d.id);
  setApprovalStatus(db, approvalId, 'DECLINED');
  setDecisionStatus(db, d.id, 'DECLINED');
  ctx().chain.record('approval.declined', { decisionId: d.id, approvalId });
  emit({ mandateId: d.mandate_id, type: 'approval', data: { approvalId, decisionId: d.id, status: 'DECLINED' } });
}

/** Fallback (labelled "in-app approval"): after an explicit click, pay through the vault instead. */
export async function approveInApp(approvalId: string) {
  const { db, paypal } = ctx();
  const a = getApproval(db, approvalId);
  if (!a || a.status !== 'PENDING') throw new Error('This approval is no longer pending.');
  const d = getDecision(db, a.decision_id)!;
  const sm = getMandate(db, d.mandate_id);
  if (!sm?.vaultTokenRef) throw new Error('No saved PayPal wallet');
  setApprovalStatus(db, approvalId, 'APPROVED');
  const v = { decisionId: d.id, amountCents: d.amount_cents, binding: { sku: d.sku!, name: '', merchantId: d.merchant_id ?? '', unitCents: 0, qty: d.qty ?? 1 } } as Verdict;
  try {
    let order = await createVaultOrder(paypal(), { vaultId: sm.vaultTokenRef, unit: unitFor(v, d.mandate_id), requestId: `fallback-${d.id}` });
    if (order.status !== 'COMPLETED') order = await captureOrder(paypal(), order.id, `capture-fallback-${d.id}`);
    const r = settle(d.id, d.mandate_id, order, 'FALLBACK', d.amount_cents);
    setApprovalStatus(db, approvalId, r.status === 'COMPLETED' ? 'CAPTURED' : 'FAILED');
    emit({ mandateId: d.mandate_id, type: 'approval', data: { approvalId, decisionId: d.id, status: r.status === 'COMPLETED' ? 'CAPTURED' : 'FAILED', mode: 'FALLBACK' } });
    return r;
  } catch (e) {
    setApprovalStatus(db, approvalId, 'FAILED');
    return failed(d.id, d.mandate_id, d.amount_cents, 'FALLBACK', e);
  }
}

export class UndoError extends Error {
  override name = 'UndoError';
}

/** One-click undo: a real PayPal refund of the original capture, within the undo window. */
export async function undoPurchase(decisionId: string) {
  const { db, ledger, chain, paypal } = ctx();
  const d = getDecision(db, decisionId);
  const p = getPurchase(db, decisionId);
  // A repeated click after a successful undo returns the same refund (idempotent), before any other check.
  const existing = getRefund(db, decisionId);
  if (existing?.status === 'COMPLETED') return { refundId: existing.refund_id, status: 'COMPLETED' as const, alreadyDone: true };
  if (!d || !p?.capture_id || p.status !== 'COMPLETED') throw new UndoError('Nothing to undo for this decision.');
  const sm = getMandate(db, d.mandate_id)!;
  const capturedAt = Date.parse(p.captured_at ?? p.created_at);
  if (Date.now() - capturedAt > sm.mandate.undoWindowSec * 1000) throw new UndoError('The undo window has closed.');
  upsertRefund(db, { decisionId, captureId: p.capture_id, status: 'PENDING', amountCents: p.amount_cents });
  const refund = await refundCapture(paypal(), p.capture_id, { requestId: `undo-${decisionId}`, amountCents: p.amount_cents, noteToPayer: 'Undone in ALLOWANCE' });
  upsertRefund(db, { decisionId, captureId: p.capture_id, refundId: refund.id, status: refund.status, amountCents: p.amount_cents });
  if (refund.status === 'COMPLETED') {
    ledger.refund(decisionId);
    setDecisionStatus(db, decisionId, 'REFUNDED');
    upsertPurchase(db, { decisionId, status: 'REFUNDED', amountCents: p.amount_cents, path: p.path });
  }
  chain.record('refund', { decisionId, captureId: p.capture_id, refundId: refund.id, status: refund.status, amountCents: p.amount_cents });
  emit({ mandateId: d.mandate_id, type: 'refund', data: { decisionId, refundId: refund.id, status: refund.status, amountCents: p.amount_cents } });
  return { refundId: refund.id, status: refund.status, alreadyDone: false };
}

/** Starts the approvals poller once per process. */
export function ensureApprovalPoller() {
  const g = globalThis as unknown as { __allowancePoller?: NodeJS.Timeout };
  if (g.__allowancePoller) return;
  g.__allowancePoller = setInterval(() => void pollApprovals(), 3000);
  g.__allowancePoller.unref?.();
}
