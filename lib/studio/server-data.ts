// Builds the Control Room's tables (ControlRoomData, ./types.ts) from the store and the latest Attack
// Lab results. Falls back to clearly labelled sample data only when nothing has been recorded yet.
import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ctx } from '@/lib/allowance/context';
import { RULE_BY_ID } from '@/lib/guard/rules/meta';
import type { LabSummary } from '@/lib/lab/metrics';
import { FAMILIES } from '@/lib/lab/scenario-schema';
import { getPurchase, getRefund, listDecisions, listMandates } from '@/lib/store/repo';
import { SEED_DATA } from './seed-data';
import type { ControlRoomData, DecisionRow, LabResultRow, MandateRow, MerchantRow, RuleResultRow } from './types';

const usd = (cents: number) => Math.round(cents) / 100;

function labRows(): LabResultRow[] {
  const rows: LabResultRow[] = [];
  const read = (f: string) => {
    const p = path.join(process.cwd(), 'lab', 'results', f);
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as { summary: LabSummary }) : null;
  };
  const main = read('latest.json');
  for (const f of main?.summary.attacks.families ?? []) {
    for (const config of ['unguarded', 'guarded'] as const) {
      const r = f[config];
      rows.push({ family: f.family, familyName: f.name, config, scenarios: f.scenarios, runs: r.n, successes: r.k, asr: r.rate, holdout: false });
    }
  }
  const hold = read('holdout-latest.json')?.summary.holdout;
  if (hold) {
    for (const config of ['unguarded', 'guarded'] as const) {
      const r = hold[config];
      rows.push({ family: 'HOLDOUT', familyName: FAMILIES.HOLDOUT, config, scenarios: 0, runs: r.n, successes: r.k, asr: r.rate, holdout: true });
    }
  }
  return rows;
}

export function controlRoomData(): { data: ControlRoomData; sample: boolean } {
  const { db, world, ledger } = ctx();
  const now = new Date();
  const decisionsRaw = listDecisions(db);
  const lab = labRows();
  if (!decisionsRaw.length && !lab.length) return { data: { ...SEED_DATA, asOf: now.toISOString() }, sample: true };

  const mandates: MandateRow[] = listMandates(db)
    .filter((sm) => decisionsRaw.some((d) => d.mandate_id === sm.mandate.id))
    .map(({ mandate: m }) => {
      const t = ledger.totals(m.id);
      return {
        id: m.id,
        name: m.name,
        status: m.status,
        budgetUsd: usd(m.budgetCents),
        committedUsd: usd(t.committedCents),
        reservedUsd: usd(t.reservedCents),
        remainingUsd: usd(Math.max(0, m.budgetCents - t.committedCents - t.reservedCents)),
        perPurchaseCapUsd: usd(m.perPurchaseCapCents),
        stepUpAboveUsd: usd(m.stepUpAboveCents),
        periodStart: m.periodStart,
        periodEnd: m.periodEnd,
        daysLeft: Math.max(0, Math.ceil((Date.parse(m.periodEnd) - now.getTime()) / 86_400_000)),
      };
    });

  const undoWindow = new Map(listMandates(db).map((sm) => [sm.mandate.id, sm.mandate.undoWindowSec]));
  const decisions: DecisionRow[] = decisionsRaw.map((d) => {
    const item = d.sku ? world.registry.item(d.sku) : undefined;
    const merchant = item ? world.registry.merchant(item.merchantId) : undefined;
    const p = getPurchase(db, d.id);
    const refund = getRefund(db, d.id);
    const capturedAt = p?.captured_at ? Date.parse(p.captured_at) : undefined;
    const undoUntil = capturedAt && p?.status === 'COMPLETED' ? new Date(capturedAt + (undoWindow.get(d.mandate_id) ?? 600) * 1000).toISOString() : '';
    return {
      id: d.id,
      at: d.at,
      mandateId: d.mandate_id,
      runId: d.run_id ?? '',
      toolName: d.tool_name,
      verdict: d.verdict,
      amountUsd: usd(d.amount_cents),
      merchantId: item?.merchantId ?? '',
      merchantName: merchant?.name ?? '',
      sku: d.sku ?? '',
      itemName: item?.name ?? d.tool_name,
      qty: d.qty ?? 0,
      firstBlock: (d.first_block ?? '') as DecisionRow['firstBlock'],
      firstBlockName: d.first_block ? RULE_BY_ID[d.first_block as keyof typeof RULE_BY_ID]?.name ?? '' : '',
      status: d.status,
      paypalConfirmed: Boolean(p?.paypal_confirmed),
      captureId: p?.capture_id ?? '',
      refundId: refund?.refund_id ?? '',
      undoExpiresAt: undoUntil,
      latencyMs: (d.latency_us ?? 0) / 1000,
      source: d.source,
    };
  });

  const rule_results: RuleResultRow[] = (db.prepare('SELECT decision_id, rule_id, name, kind, outcome, detail FROM rule_results ORDER BY decision_id, rule_id').all() as { decision_id: string; rule_id: string; name: string; kind: string; outcome: string; detail: string }[]).map((r) => ({
    decisionId: r.decision_id,
    ruleId: r.rule_id as RuleResultRow['ruleId'],
    ruleName: r.name,
    kind: r.kind as RuleResultRow['kind'],
    outcome: r.outcome as RuleResultRow['outcome'],
    detail: r.detail,
  }));

  const merchants: MerchantRow[] = world.merchants().map((m) => ({ id: m.id, name: m.name, category: m.categories[0] ?? '', riskFlags: m.riskFlags.join(',') }));
  return { data: { asOf: now.toISOString(), mandates, decisions, rule_results, merchants, lab_results: lab }, sample: false };
}
