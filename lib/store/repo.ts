// Typed access to the ALLOWANCE store. Vault token ids stay server-side: only masked forms leave here
// through the public row types.
import type { Intent, Mandate, TaskContract, Verdict } from '@/lib/guard';
import type { Db } from './db';

const now = () => new Date().toISOString();
const json = (v: unknown) => JSON.stringify(v);

// --- Mandates --------------------------------------------------------------------------------------
type MandateRow = {
  id: string; name: string; status: Mandate['status']; currency: 'USD'; budget_cents: number; period_start: string; period_end: string;
  per_purchase_cap_cents: number; step_up_above_cents: number; step_up_on_new_merchant: number; allowed_categories: string;
  allowed_merchants: string; allow_recurring: number; velocity: string; price_drift_pct: number; undo_window_sec: number;
  kill_switch: number; vault_token_ref: string | null; vault_customer_ref: string | null; session_id: string | null; created_at: string; updated_at: string;
};

export type StoredMandate = { mandate: Mandate; vaultTokenRef: string | null; vaultCustomerRef: string | null; sessionId: string | null; createdAt: string };

const toMandate = (r: MandateRow): StoredMandate => ({
  mandate: {
    id: r.id, name: r.name, status: r.status, currency: r.currency, budgetCents: r.budget_cents, periodStart: r.period_start, periodEnd: r.period_end,
    perPurchaseCapCents: r.per_purchase_cap_cents, stepUpAboveCents: r.step_up_above_cents, stepUpOnNewMerchant: !!r.step_up_on_new_merchant,
    allowedCategories: JSON.parse(r.allowed_categories), allowedMerchants: JSON.parse(r.allowed_merchants), allowRecurring: !!r.allow_recurring,
    velocity: JSON.parse(r.velocity), priceDriftPct: r.price_drift_pct, undoWindowSec: r.undo_window_sec, killSwitch: !!r.kill_switch, vaultLinked: !!r.vault_token_ref,
  },
  vaultTokenRef: r.vault_token_ref,
  vaultCustomerRef: r.vault_customer_ref,
  sessionId: r.session_id,
  createdAt: r.created_at,
});

export function insertMandate(db: Db, m: Mandate, extra: { sessionId?: string; vaultTokenRef?: string | null; vaultCustomerRef?: string | null } = {}) {
  const t = now();
  db.prepare(
    `INSERT INTO mandates (id, name, status, currency, budget_cents, period_start, period_end, per_purchase_cap_cents, step_up_above_cents, step_up_on_new_merchant,
      allowed_categories, allowed_merchants, allow_recurring, velocity, price_drift_pct, undo_window_sec, kill_switch, vault_token_ref, vault_customer_ref, session_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(m.id, m.name, m.status, m.currency, m.budgetCents, m.periodStart, m.periodEnd, m.perPurchaseCapCents, m.stepUpAboveCents, +m.stepUpOnNewMerchant,
    json(m.allowedCategories), json(m.allowedMerchants), +m.allowRecurring, json(m.velocity), m.priceDriftPct, m.undoWindowSec, +m.killSwitch,
    extra.vaultTokenRef ?? null, extra.vaultCustomerRef ?? null, extra.sessionId ?? null, t, t);
}

export function getMandate(db: Db, id: string): StoredMandate | undefined {
  const r = db.prepare<[string], MandateRow>('SELECT * FROM mandates WHERE id = ?').get(id);
  return r ? toMandate(r) : undefined;
}

export function latestMandateForSession(db: Db, sessionId: string): StoredMandate | undefined {
  const r = db.prepare<[string], MandateRow>('SELECT * FROM mandates WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(sessionId);
  return r ? toMandate(r) : undefined;
}

export function listMandates(db: Db): StoredMandate[] {
  return db.prepare<[], MandateRow>('SELECT * FROM mandates ORDER BY created_at DESC').all().map(toMandate);
}

export function setMandateStatus(db: Db, id: string, status: Mandate['status'], killSwitch?: boolean) {
  db.prepare('UPDATE mandates SET status = ?, kill_switch = COALESCE(?, kill_switch), updated_at = ? WHERE id = ?').run(status, killSwitch === undefined ? null : +killSwitch, now(), id);
}

export function linkVault(db: Db, id: string, tokenRef: string, customerRef: string | null) {
  db.prepare("UPDATE mandates SET vault_token_ref = ?, vault_customer_ref = ?, status = 'ACTIVE', updated_at = ? WHERE id = ?").run(tokenRef, customerRef, now(), id);
}

/** Policy fields only (the Auditor's proposals are applied here, by a human). */
export function updateMandatePolicy(db: Db, id: string, p: Pick<Mandate, 'budgetCents' | 'perPurchaseCapCents' | 'stepUpAboveCents' | 'allowedCategories' | 'allowRecurring' | 'velocity' | 'priceDriftPct'>) {
  db.prepare('UPDATE mandates SET budget_cents=?, per_purchase_cap_cents=?, step_up_above_cents=?, allowed_categories=?, allow_recurring=?, velocity=?, price_drift_pct=?, updated_at=? WHERE id=?')
    .run(p.budgetCents, p.perPurchaseCapCents, p.stepUpAboveCents, json(p.allowedCategories), +p.allowRecurring, json(p.velocity), p.priceDriftPct, now(), id);
}

// --- Contracts --------------------------------------------------------------------------------------
export function insertContract(db: Db, c: TaskContract, taskText: string) {
  db.transaction(() => {
    db.prepare('INSERT INTO task_contracts (id, mandate_id, task_text, confirmed_at, created_at) VALUES (?,?,?,?,?)').run(c.id, c.mandateId, taskText, c.confirmedAt, now());
    const ins = db.prepare('INSERT INTO contract_lines (id, contract_id, category, product_type, description, max_qty, max_unit_cents) VALUES (?,?,?,?,?,?,?)');
    for (const l of c.lines) ins.run(l.id, c.id, l.category, l.productType, l.description, l.maxQty, l.maxUnitCents);
  })();
}

export function getContract(db: Db, id: string): (TaskContract & { taskText: string }) | undefined {
  const c = db.prepare<[string], { id: string; mandate_id: string; task_text: string; confirmed_at: string | null }>('SELECT * FROM task_contracts WHERE id = ?').get(id);
  if (!c) return undefined;
  const lines = db
    .prepare<[string], { id: string; category: string; product_type: string; description: string; max_qty: number; max_unit_cents: number }>('SELECT * FROM contract_lines WHERE contract_id = ? ORDER BY id')
    .all(id)
    .map((l) => ({ id: l.id, category: l.category, productType: l.product_type, description: l.description, maxQty: l.max_qty, maxUnitCents: l.max_unit_cents }));
  return { id: c.id, mandateId: c.mandate_id, confirmedAt: c.confirmed_at, lines, taskText: c.task_text };
}

/** Confirm once; a confirmed contract can never change. */
export function confirmContractRow(db: Db, id: string, at = now()) {
  db.prepare('UPDATE task_contracts SET confirmed_at = ? WHERE id = ? AND confirmed_at IS NULL').run(at, id);
}

// --- Decisions ----------------------------------------------------------------------------------------
export type DecisionStatus = 'EVALUATED' | 'EXECUTED' | 'PENDING_APPROVAL' | 'FAILED' | 'REFUNDED' | 'BLOCKED' | 'DECLINED';

export function insertDecision(db: Db, v: Verdict, ctx: { mandateId: string; contractId?: string; runId?: string; intent: Intent; tool: string; source?: 'live' | 'replay'; status?: DecisionStatus }) {
  db.transaction(() => {
    db.prepare(
      `INSERT INTO decisions (id, mandate_id, contract_id, run_id, tool_name, intent, verdict, amount_cents, merchant_id, sku, qty, first_block, step_up_reasons, explanation, status, latency_us, source, at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(v.decisionId, ctx.mandateId, ctx.contractId ?? null, ctx.runId ?? null, ctx.tool, json(ctx.intent), v.verdict, v.amountCents, v.binding?.merchantId ?? null, v.binding?.sku ?? null, v.binding?.qty ?? null,
      v.firstBlock ?? null, json(v.stepUpReasons), v.explanation ?? null, ctx.status ?? (v.verdict === 'BLOCK' ? 'BLOCKED' : 'EVALUATED'), v.latencyUs, ctx.source ?? 'live', v.at);
    const rr = db.prepare('INSERT INTO rule_results (decision_id, rule_id, name, kind, outcome, detail) VALUES (?,?,?,?,?,?)');
    for (const r of v.rules) rr.run(v.decisionId, r.id, r.name, r.kind, r.outcome, r.userMessage && r.outcome !== 'PASS' && r.outcome !== 'SKIP' ? `${r.detail} — ${r.userMessage}` : r.detail);
  })();
}

export function setDecisionStatus(db: Db, id: string, status: DecisionStatus) {
  db.prepare('UPDATE decisions SET status = ? WHERE id = ?').run(status, id);
}

export function setExplanation(db: Db, id: string, text: string) {
  db.prepare('UPDATE decisions SET explanation = ? WHERE id = ?').run(text.slice(0, 400), id);
}

export type DecisionRow = {
  id: string; mandate_id: string; contract_id: string | null; run_id: string | null; tool_name: string; intent: string; verdict: Verdict['verdict'];
  amount_cents: number; merchant_id: string | null; sku: string | null; qty: number | null; first_block: string | null; step_up_reasons: string;
  explanation: string | null; status: DecisionStatus; latency_us: number | null; source: 'live' | 'replay'; at: string;
};

export function getDecision(db: Db, id: string) {
  return db.prepare<[string], DecisionRow>('SELECT * FROM decisions WHERE id = ?').get(id);
}

export function listDecisions(db: Db, mandateId?: string) {
  return mandateId
    ? db.prepare<[string], DecisionRow>('SELECT * FROM decisions WHERE mandate_id = ? ORDER BY at ASC').all(mandateId)
    : db.prepare<[], DecisionRow>('SELECT * FROM decisions ORDER BY at ASC').all();
}

export function ruleResults(db: Db, decisionId: string) {
  return db.prepare<[string], { rule_id: string; name: string; kind: string; outcome: string; detail: string }>('SELECT rule_id, name, kind, outcome, detail FROM rule_results WHERE decision_id = ? ORDER BY rule_id').all(decisionId);
}

// --- Purchases, refunds, approvals ---------------------------------------------------------------------
export type PurchaseRow = { decision_id: string; order_id: string | null; capture_id: string | null; status: string; amount_cents: number; path: 'VAULT' | 'APPROVAL' | 'FALLBACK' | 'FAKE'; paypal_confirmed: number; captured_at: string | null; created_at: string };

export function upsertPurchase(db: Db, p: { decisionId: string; orderId?: string | null; captureId?: string | null; status: string; amountCents: number; path: PurchaseRow['path']; capturedAt?: string | null }) {
  db.prepare(
    `INSERT INTO purchases (decision_id, order_id, capture_id, status, amount_cents, path, captured_at, created_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(decision_id) DO UPDATE SET order_id=COALESCE(excluded.order_id, order_id), capture_id=COALESCE(excluded.capture_id, capture_id), status=excluded.status, path=excluded.path, captured_at=COALESCE(excluded.captured_at, captured_at)`,
  ).run(p.decisionId, p.orderId ?? null, p.captureId ?? null, p.status, p.amountCents, p.path, p.capturedAt ?? null, now());
}

export function getPurchase(db: Db, decisionId: string) {
  return db.prepare<[string], PurchaseRow>('SELECT * FROM purchases WHERE decision_id = ?').get(decisionId);
}

export function markPayPalConfirmed(db: Db, by: { captureId?: string; orderId?: string }) {
  if (by.captureId) db.prepare('UPDATE purchases SET paypal_confirmed = 1 WHERE capture_id = ?').run(by.captureId);
  if (by.orderId) db.prepare('UPDATE purchases SET paypal_confirmed = 1 WHERE order_id = ?').run(by.orderId);
}

export function upsertRefund(db: Db, r: { decisionId: string; captureId: string; refundId?: string | null; status: string; amountCents: number }) {
  db.prepare(
    `INSERT INTO refunds (id, decision_id, capture_id, refund_id, status, amount_cents, created_at) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET refund_id=COALESCE(excluded.refund_id, refund_id), status=excluded.status`,
  ).run(`undo-${r.decisionId}`, r.decisionId, r.captureId, r.refundId ?? null, r.status, r.amountCents, now());
}

export function getRefund(db: Db, decisionId: string) {
  return db.prepare<[string], { id: string; refund_id: string | null; status: string; amount_cents: number; created_at: string }>('SELECT * FROM refunds WHERE decision_id = ?').get(decisionId);
}

export type ApprovalRow = { id: string; decision_id: string; order_id: string | null; approve_url: string | null; status: string; mode: 'PAYPAL' | 'FALLBACK'; created_at: string; approved_at: string | null };

export function insertApproval(db: Db, a: { id: string; decisionId: string; orderId?: string; approveUrl?: string; mode: ApprovalRow['mode'] }) {
  db.prepare("INSERT INTO approvals (id, decision_id, order_id, approve_url, status, mode, created_at) VALUES (?,?,?,?, 'PENDING', ?, ?)").run(a.id, a.decisionId, a.orderId ?? null, a.approveUrl ?? null, a.mode, now());
}

export function setApprovalStatus(db: Db, id: string, status: string) {
  db.prepare("UPDATE approvals SET status = ?, approved_at = CASE WHEN ? IN ('APPROVED','CAPTURED') THEN COALESCE(approved_at, ?) ELSE approved_at END WHERE id = ?").run(status, status, now(), id);
}

export function getApproval(db: Db, id: string) {
  return db.prepare<[string], ApprovalRow>('SELECT * FROM approvals WHERE id = ?').get(id);
}

export function pendingApprovals(db: Db) {
  return db.prepare<[], ApprovalRow>("SELECT * FROM approvals WHERE status IN ('PENDING','APPROVED') ORDER BY created_at").all();
}

// --- Key/value (e.g. demo vault token on the deployed app) --------------------------------------------
export const kv = {
  get: (db: Db, key: string) => db.prepare<[string], { value: string }>('SELECT value FROM kv WHERE key = ?').get(key)?.value,
  set: (db: Db, key: string, value: string) => db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),
};
