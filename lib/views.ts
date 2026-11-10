// View models shared by the server (live events, replays) and the browser (lane, cards). Isomorphic:
// imports only pure guard types.
import type { Verdict } from '@/lib/guard';

/** What the Firewall Lane and verdict cards need about a decision (no secrets, no attacker text). */
export function decisionView(v: Verdict, tool: string) {
  const fired = v.rules.find((r) => r.id === v.firstBlock);
  return {
    decisionId: v.decisionId,
    verdict: v.verdict,
    tool,
    at: v.at,
    item: v.binding?.name ?? null,
    sku: v.binding?.sku ?? null,
    qty: v.binding?.qty ?? null,
    amountCents: v.amountCents,
    firstBlock: v.firstBlock ?? null,
    firstBlockName: fired?.name ?? null,
    reason: fired?.userMessage ?? v.rules.filter((r) => r.outcome === 'STEP_UP').map((r) => r.userMessage).join(' ') ?? null,
    stepUpReasons: v.stepUpReasons,
    summary: v.summary,
    rules: v.rules.map((r) => ({ id: r.id, name: r.name, kind: r.kind, outcome: r.outcome, detail: r.detail, message: r.userMessage ?? null })),
    latencyUs: v.latencyUs,
  };
}
export type DecisionView = ReturnType<typeof decisionView>;



export type PurchaseView = { decisionId: string; orderId?: string; captureId?: string; status: 'COMPLETED' | 'FAILED' | string; path?: string; amountCents?: number; error?: string };
export type ApprovalView = { approvalId: string; decisionId: string; status: 'PENDING' | 'APPROVED' | 'CAPTURED' | 'DECLINED' | 'EXPIRED' | 'FAILED' | string; approvePage?: string; amountCents?: number; mode?: string };
export type RefundView = { decisionId: string; refundId?: string; status: string; amountCents?: number };
export type ExplanationView = { decisionId: string; text: string };
