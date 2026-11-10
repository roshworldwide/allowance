// Recorded agent intents for policy what-ifs: live and replayed runs from the store, plus every guarded
// run of the latest Attack Lab (real agent behaviour under attack and on normal errands).
import 'server-only';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Intent, mandatePreset, type TaskContract } from '@/lib/guard';
import { DEMO_PRESET } from '@/lib/guard/policy';
import type { HistoryRun } from '@/lib/guard/simulate';
import { scenarioContract, scenarioWorld, type RunRecord } from '@/lib/lab/runner';
import { Scenario } from '@/lib/lab/scenario-schema';
import { getContract, getMandate, listDecisions } from '@/lib/store/repo';
import { ctx } from './context';

let labCache: { mtime: number; runs: HistoryRun[] } | undefined;

function labHistory(): HistoryRun[] {
  const file = path.join(process.cwd(), 'lab', 'results', 'latest.json');
  if (!existsSync(file)) return [];
  const mtime = statSync(file).mtimeMs;
  if (labCache?.mtime === mtime) return labCache.runs;
  const lab = JSON.parse(readFileSync(file, 'utf8')) as { meta: { date: string }; runs: RunRecord[] };
  const scenarios = new Map<string, Scenario>();
  for (const dir of ['attacks', 'benign']) {
    const d = path.join(process.cwd(), 'lib', 'lab', 'scenarios', dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
      const s = Scenario.parse(JSON.parse(readFileSync(path.join(d, f), 'utf8')));
      scenarios.set(s.id, s);
    }
  }
  const when = new Date(lab.meta.date);
  const runs: HistoryRun[] = [];
  for (const r of lab.runs) {
    const s = scenarios.get(r.scenario);
    if (!s || r.config !== 'guarded' || !r.verdicts.length || !r.verdicts.every((v) => v.intent)) continue;
    const mandate = mandatePreset({ id: `mnd_hist_${r.scenario}_${r.seed}`, now: when, vaultLinked: true, preset: { ...DEMO_PRESET, ...s.mandate } });
    runs.push({
      id: `lab:${r.scenario}:${r.seed}`,
      source: 'lab',
      kind: s.family === 'BENIGN' ? 'benign' : 'attack',
      label: `${s.id} · ${s.title}`,
      mandate,
      contract: scenarioContract(s, mandate.id, when),
      registry: scenarioWorld(s).registry,
      decisions: r.verdicts.map((v, i) => ({ at: new Date(when.getTime() + i * 60_000).toISOString(), intent: v.intent, authorised: v.authorisedIntent })),
    });
  }
  labCache = { mtime, runs };
  return runs;
}

function storeHistory(): HistoryRun[] {
  const { db, world } = ctx();
  const byRun = new Map<string, ReturnType<typeof listDecisions>>();
  for (const d of listDecisions(db)) {
    if (!d.run_id) continue;
    byRun.set(d.run_id, [...(byRun.get(d.run_id) ?? []), d]);
  }
  const runs: HistoryRun[] = [];
  for (const [runId, ds] of byRun) {
    const first = ds[0]!;
    const sm = getMandate(db, first.mandate_id);
    if (!sm) continue;
    const c = first.contract_id ? getContract(db, first.contract_id) : undefined;
    const contract: TaskContract | null = c ? { id: c.id, mandateId: c.mandateId, confirmedAt: c.confirmedAt, lines: c.lines } : null;
    const decisions = ds.flatMap((d) => {
      const parsed = Intent.safeParse(JSON.parse(d.intent));
      return parsed.success ? [{ at: d.at, intent: parsed.data }] : [];
    });
    if (decisions.length) runs.push({ id: runId, source: first.source, kind: 'unknown', label: c?.taskText ?? runId, mandate: { ...sm.mandate, status: 'ACTIVE', vaultLinked: true, killSwitch: false }, contract, registry: world.registry, decisions });
  }
  return runs;
}

export function loadHistory(): HistoryRun[] {
  return [...storeHistory(), ...labHistory()];
}
