// npm run go — everything that needs your keys, in order, once they are in .env.local:
//   1. required keys present (names only)      5. smoke:sandbox ($1 charge + refund)
//   2. S0: probe models → OPENAI_MODELS         6. lab:quick (40 runs)
//   3. doctor (online checks)                  7. full Attack Lab (first full run, cost-capped)
//   4. S1: link the sandbox wallet (you approve)8. docs:sync (numbers into README / Devpost / script)
// Flags: --skip-full (stop after lab:quick)   --from <step number>
// Only non-secret lines of .env.local are ever written (OPENAI_MODELS, AGENT_MODEL); no value is printed.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV = '.env.local';
const args = process.argv.slice(2);
const from = Number(args[args.indexOf('--from') + 1] ?? 1) || 1;
const skipFull = args.includes('--skip-full');

// dotenv's line grammar (Next.js reads .env.local with dotenv): optional `export`, spaces around `=`,
// quoted values, trailing # comments. Reading it the same way keeps this script and the app in agreement.
const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

function readEnv(): Record<string, string> {
  if (!existsSync(ENV)) return {};
  const out: Record<string, string> = {};
  for (const m of readFileSync(ENV, 'utf8').replace(/\r\n?/g, '\n').matchAll(LINE)) out[m[1]!] = (m[2] ?? '').trim().replace(/^(['"`])([\s\S]*)\1$/, '$2');
  return out;
}
const envValue = (key: string) => readEnv()[key] ?? '';

function setEnvLine(key: string, value: string) {
  const text = readFileSync(ENV, 'utf8');
  const existing = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`, 'm');
  const line = `${key}=${value}`;
  writeFileSync(ENV, existing.test(text) ? text.replace(existing, () => line) : `${text.trimEnd()}\n${line}\n`, { mode: 0o600 });
}

function step(n: number, title: string, fn: () => boolean) {
  if (n < from) return;
  console.log(`\n━━━ ${n}. ${title} ${'━'.repeat(Math.max(0, 60 - title.length))}`);
  if (!fn()) {
    console.error(`\n✗ Step ${n} failed. Fix it, then resume with: npm run go -- --from ${n}`);
    process.exit(1);
  }
}

const run = (script: string, extra: string[] = []) => spawnSync('npm', ['run', '-s', script, ...(extra.length ? ['--', ...extra] : [])], { stdio: 'inherit' }).status === 0;

/** Reads the quick run (step 6): stops if it mostly errored, and projects the full run's cost from what it measured. */
function beforeFullRun(): boolean {
  type Quick = { meta: { kind: string; runsDone: number; estimatedCostUsd: number }; runs: { stopReason: string; error?: string }[] };
  let q: Quick;
  try {
    q = JSON.parse(readFileSync('lab/results/latest.json', 'utf8')) as Quick;
  } catch {
    return true; // no quick run to learn from (e.g. --from 7 on a fresh checkout)
  }
  if (q.meta.kind !== 'quick' || !q.meta.runsDone) return true;
  const errored = q.runs.filter((r) => r.stopReason === 'error' || r.error);
  if (errored.length > q.runs.length / 4) {
    console.error(`${errored.length} of ${q.runs.length} quick runs errored (first: ${errored[0]?.error?.slice(0, 160) ?? 'no message'}). Fix that before the full run.`);
    return false;
  }
  const scenarios = ['attacks', 'benign'].reduce((n, d) => n + readdirSync(`lib/lab/scenarios/${d}`).filter((f) => f.endsWith('.json')).length, 0);
  const planned = scenarios * 2 * 3;
  const perRun = q.meta.estimatedCostUsd / q.meta.runsDone;
  const cap = Number(envValue('LAB_MAX_USD') || 8);
  console.log(`The quick run cost ~$${perRun.toFixed(3)} per run, so all ${planned} runs ≈ $${(perRun * planned).toFixed(2)} (cap: LAB_MAX_USD=$${cap}).`);
  if (perRun * planned > cap) {
    console.log(`The cap will stop it after about ${Math.floor(cap / perRun)} runs; jobs are seed-major and interleaved, so that part is a fair sample.`);
    console.log(`To finish all ${planned} instead: press Ctrl+C now, raise LAB_MAX_USD in ${ENV}, then run: npm run go -- --from 7`);
    console.log('Starting in 15 seconds…');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15_000);
  }
  return true;
}

step(1, 'Keys present', () => {
  if (!existsSync(ENV)) {
    console.error(`No ${ENV} in ${process.cwd()}. Run this from the allowance folder (cp env.example ${ENV} if it is missing).`);
    return false;
  }
  const missing = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'AG_STUDIO_OPENAI_API_KEY', 'DEMO_PASSCODE'].filter((k) => !envValue(k));
  if (missing.length) {
    console.error(`Empty in ${resolve(ENV)} (names only): ${missing.join(', ')}`);
    console.error(`That file was last saved ${statSync(ENV).mtime.toLocaleString()}. Pasted keys in an editor since then? Save the file (Cmd+S), then run again.`);
    const loose = readFileSync(ENV, 'utf8')
      .split('\n')
      .flatMap((l, i) => (l.trim() && !/^\s*#/.test(l) && !/^\s*(?:export\s+)?[\w.-]+\s*=/.test(l) ? [i + 1] : []));
    if (loose.length) console.error(`Line ${loose.join(', ')} is not NAME=value: paste each key right after its = sign, on the same line.`);
    return false;
  }
  if (!envValue('AG_STUDIO')) console.log('note: AG_STUDIO (licence) is empty — the Control Room will show a watermark until you add it.');
  console.log('✓ required keys are set');
  return true;
});

step(2, 'S0 — which OpenAI models this key can use', () => {
  if (envValue('OPENAI_MODELS')) {
    console.log(`✓ OPENAI_MODELS already set: ${envValue('OPENAI_MODELS')}`);
    return true;
  }
  let probedAt = '';
  try {
    probedAt = (JSON.parse(readFileSync('data/models.json', 'utf8')) as { probedAt: string }).probedAt;
  } catch {}
  if (probedAt && Date.now() - Date.parse(probedAt) < 24 * 3600_000) console.log(`using today's S0 probe (data/models.json, ${new Date(probedAt).toLocaleString()})`);
  else if (!run('spike:models')) return false;
  const suggested = (JSON.parse(readFileSync('data/models.json', 'utf8')) as { suggested: string[] }).suggested;
  if (!suggested.length) {
    console.error('No model passed the function-calling + structured-output probe. Set OPENAI_MODELS by hand.');
    return false;
  }
  setEnvLine('OPENAI_MODELS', suggested.join(','));
  if (!envValue('AGENT_MODEL')) setEnvLine('AGENT_MODEL', suggested[0]!);
  console.log(`✓ wrote OPENAI_MODELS=${suggested.join(',')} and AGENT_MODEL=${envValue('AGENT_MODEL')} to ${ENV}`);
  return true;
});

step(3, 'doctor (online)', () => run('doctor'));

step(4, 'S1 — link the sandbox PayPal wallet (Vault)', () => {
  if (existsSync('data/vault-token.json')) {
    console.log('✓ a saved sandbox wallet exists (data/vault-token.json); skipping the link');
    return true;
  }
  console.log('A PayPal link will appear. Open it, log in with your US sandbox PERSONAL account and approve.');
  return run('spike:vault');
});

step(5, 'smoke:sandbox — $1.00 vault charge + refund', () => run('smoke:sandbox'));

step(6, 'Attack Lab quick (20 scenarios × 2 configs × 1 seed)', () => run('lab:quick'));

step(7, 'Attack Lab full (100 scenarios × 2 × 3 seeds, cost-capped by LAB_MAX_USD)', () => {
  if (skipFull) {
    console.log('skipped (--skip-full)');
    return true;
  }
  return beforeFullRun() && run('lab');
});

step(8, 'docs:sync — numbers into README, Devpost, judge guide, video script', () => run('docs:sync'));

console.log(`
✓ Key-dependent automation done. What only you can do now (see docs/SUBMISSION_CHECKLIST.md):
  • Record the hero errand live (RECORD_REPLAYS=true): npm run dev → /errand → link → errand → approve on phone → undo
  • G1/G3: push the repo, deploy on Render (docs/DEPLOY.md), then npm run webhook:register
  • G4: record + upload the video (docs/VIDEO_SCRIPT.md) · G2: make the repo public · G5: submit on Devpost (docs/DEVPOST.md)`);
