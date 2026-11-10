// Errand console state: one reducer fed by the run stream (agent steps), the live event bus
// (decisions, payments, approvals, refunds, explanations) and, in judge mode, a recorded replay.
// Events are merged by decision id, so their arrival order across streams doesn't matter.
import type { ApprovalView, DecisionView, ExplanationView, PurchaseView, RefundView } from '@/lib/views';

export type Step =
  | { kind: 'search'; id: string; query: string }
  | { kind: 'view'; id: string; sku: string; what: 'page' | 'reviews' }
  | { kind: 'money'; id: string; tool: string; label: string; decisionId?: string }
  | { kind: 'say'; id: string; text: string }
  | { kind: 'note'; id: string; text: string };

export type Card = {
  decision: DecisionView;
  purchase?: PurchaseView;
  approval?: ApprovalView;
  refund?: RefundView;
  explanation?: string;
  /** ms epoch when the capture landed (undo window starts) */
  capturedAt?: number;
};

export type ErrandState = {
  status: 'idle' | 'running' | 'done' | 'error';
  runId?: string;
  model?: string;
  steps: Step[];
  cards: Record<string, Card>;
  order: string[]; // decision ids, oldest first
  final?: string;
  error?: string;
  usage?: { inputTokens: number; cachedTokens: number; outputTokens: number };
};

export const initialErrand: ErrandState = { status: 'idle', steps: [], cards: {}, order: [] };

export type ErrandEvent = { source: 'run' | 'bus' | 'local'; type: string; data: unknown; at?: number };

const upsertCard = (s: ErrandState, id: string, patch: (c: Card | undefined) => Partial<Card> | null): ErrandState => {
  const prev = s.cards[id];
  const p = patch(prev);
  if (!p) return s;
  if (!prev && !p.decision) return { ...s, cards: { ...s.cards, [id]: { ...(p as Card) } } }; // partial until the decision arrives
  const next = { ...prev, ...p } as Card;
  return { ...s, cards: { ...s.cards, [id]: next }, order: s.order.includes(id) || !next.decision ? s.order : [...s.order, id] };
};

function short(sku: unknown) {
  return typeof sku === 'string' ? sku : '';
}

export function errandReducer(s: ErrandState, e: ErrandEvent): ErrandState {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const now = e.at ?? Date.now();
  switch (e.type) {
    case 'reset':
      return initialErrand;
    case 'run':
      return { ...initialErrand, status: 'running', runId: String(d.runId ?? ''), model: String(d.model ?? '') };
    case 'tool_call': {
      const args = (d.args ?? {}) as Record<string, unknown>;
      const id = String(d.callId ?? `${s.steps.length}`);
      const name = String(d.name);
      const step: Step =
        name === 'search_catalog'
          ? { kind: 'search', id, query: String(args.query ?? '') }
          : name === 'view_product' || name === 'view_reviews'
            ? { kind: 'view', id, sku: short(args.sku), what: name === 'view_product' ? 'page' : 'reviews' }
            : { kind: 'money', id, tool: name, label: args.sku ? `${short(args.sku)} × ${args.qty ?? 1}` : name };
      return { ...s, steps: [...s.steps, step] };
    }
    case 'final':
      return { ...s, final: String(d.text ?? ''), steps: [...s.steps, { kind: 'say', id: `final-${s.steps.length}`, text: String(d.text ?? '') }] };
    case 'stopped':
      return { ...s, status: d.reason === 'error' ? 'error' : 'done', error: d.reason === 'error' ? String(d.error ?? 'The agent stopped.') : s.error };
    case 'done':
      return { ...s, status: s.status === 'error' ? 'error' : 'done', usage: (d.usage as ErrandState['usage']) ?? s.usage };
    case 'error':
      return { ...s, status: 'error', error: String(d.message ?? 'Something went wrong') };
    case 'decision': {
      const v = d as unknown as DecisionView;
      const withStep = (() => {
        // Attach the decision to the latest unbound money step.
        const idx = [...s.steps].reverse().findIndex((x) => x.kind === 'money' && !x.decisionId);
        if (idx < 0) return s.steps;
        const real = s.steps.length - 1 - idx;
        return s.steps.map((x, i) => (i === real && x.kind === 'money' ? { ...x, decisionId: v.decisionId, label: v.item ? `${v.qty ?? 1} × ${v.item}` : x.label } : x));
      })();
      return upsertCard({ ...s, steps: withStep }, v.decisionId, () => ({ decision: v }));
    }
    case 'purchase': {
      const p = d as unknown as PurchaseView;
      return upsertCard(s, p.decisionId, () => ({ purchase: p, ...(p.status === 'COMPLETED' ? { capturedAt: now } : {}) }));
    }
    case 'approval': {
      const a = d as unknown as ApprovalView;
      return upsertCard(s, a.decisionId, (c) => ({ approval: { ...c?.approval, ...a } }));
    }
    case 'refund': {
      const r = d as unknown as RefundView;
      return upsertCard(s, r.decisionId, () => ({ refund: r }));
    }
    case 'explanation': {
      const x = d as unknown as ExplanationView;
      return upsertCard(s, x.decisionId, () => ({ explanation: x.text }));
    }
    default:
      return s;
  }
}

/** The card's display state, for chips and the lane. */
export function cardPhase(c: Card): 'ALLOW' | 'PAID' | 'STEP_UP' | 'APPROVED' | 'BLOCK' | 'REFUNDED' | 'DECLINED' | 'FAILED' {
  if (c.refund?.status === 'COMPLETED') return 'REFUNDED';
  if (c.decision.verdict === 'BLOCK') return 'BLOCK';
  if (c.purchase?.status === 'FAILED') return 'FAILED';
  if (c.decision.verdict === 'STEP_UP') {
    if (c.approval?.status === 'DECLINED' || c.approval?.status === 'EXPIRED') return 'DECLINED';
    if (c.purchase?.status === 'COMPLETED' || c.approval?.status === 'CAPTURED') return 'APPROVED';
    return 'STEP_UP';
  }
  return c.purchase?.status === 'COMPLETED' ? 'PAID' : 'ALLOW';
}
