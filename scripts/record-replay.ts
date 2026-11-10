// npm run record-replay — judge-mode replays are recorded from REAL live sandbox runs on the owner's
// machine. This script explains how and validates what is in replays/ (non-synthetic, self-contained,
// decisions + captures present, no approval links).
import './_env';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'replays');
console.log(`To record: set RECORD_REPLAYS=true and OWNER_MODE=true in .env.local, run \`npm run dev\`, do the errand in /errand
(link → contract → send the agent → approve the step-up on your phone → undo). The run, the approval and the undo are
written to replays/<date>-<allowance>.json for 15 minutes. Then commit the file.
Currently: RECORD_REPLAYS=${process.env.RECORD_REPLAYS === 'true' ? 'true' : 'false'}, OWNER_MODE=${process.env.OWNER_MODE === 'true' ? 'true' : 'false'}\n`);

if (!existsSync(dir)) {
  console.log('replays/: none yet.');
  process.exit(0);
}
let bad = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const r = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { meta: { synthetic?: boolean; contract?: unknown; mandate?: unknown; recordedAt: string; model: string }; events: { type: string; data: Record<string, unknown> }[] };
  const types = r.events.reduce<Record<string, number>>((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {});
  const problems = [
    r.meta.synthetic && 'synthetic (must not be in replays/)',
    !r.meta.contract && 'missing contract',
    !r.meta.mandate && 'missing mandate',
    !types.decision && 'no decisions',
    JSON.stringify(r).includes('approveUrl') && 'contains approval links',
  ].filter(Boolean);
  if (problems.length) bad++;
  console.log(`${problems.length ? '✗' : '✓'} ${f}  ${r.meta.recordedAt} · ${r.meta.model} · ${Object.entries(types).map(([t, n]) => `${t} ${n}`).join(', ')}${problems.length ? `  — ${problems.join('; ')}` : ''}`);
}
process.exitCode = bad ? 1 : 0;
