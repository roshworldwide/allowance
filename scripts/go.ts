// npm run go — everything that needs your keys, in order, once they are in .env.local:
//   1. required keys present (names only)      5. smoke:sandbox ($1 charge + refund)
//   2. S0: probe models → OPENAI_MODELS         6. lab:quick (40 runs)
//   3. doctor (online checks)                  7. full Attack Lab (first full run, cost-capped)
//   4. S1: link the sandbox wallet (you approve)8. docs:sync (numbers into README / Devpost / script)
// Flags: --skip-full (stop after lab:quick)   --from <step number>
// Only non-secret lines of .env.local are ever written (OPENAI_MODELS, AGENT_MODEL); nothing is printed.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV = '.env.local';
const args = process.argv.slice(2);
const from = Number(args[args.indexOf('--from') + 1] ?? 1) || 1;
const skipFull = args.includes('--skip-full');

function envValue(key: string): string {
  if (!existsSync(ENV)) return '';
  const m = readFileSync(ENV, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return (m?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function setEnvLine(key: string, value: string) {
  const text = readFileSync(ENV, 'utf8');
  const line = `${key}=${value}`;
  writeFileSync(ENV, new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text.trimEnd()}\n${line}\n`, { mode: 0o600 });
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

step(1, 'Keys present', () => {
  const missing = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'AG_STUDIO_OPENAI_API_KEY', 'DEMO_PASSCODE'].filter((k) => !envValue(k));
  if (missing.length) {
    console.error(`Paste these into ${ENV} first (names only shown): ${missing.join(', ')}`);
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
  if (!run('spike:models')) return false;
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
  return run('lab');
});

step(8, 'docs:sync — numbers into README, Devpost, judge guide, video script', () => run('docs:sync'));

console.log(`
✓ Key-dependent automation done. What only you can do now (see docs/SUBMISSION_CHECKLIST.md):
  • Record the hero errand live (RECORD_REPLAYS=true): npm run dev → /errand → link → errand → approve on phone → undo
  • G1/G3: push the repo, deploy on Render (docs/DEPLOY.md), then npm run webhook:register
  • G4: record + upload the video (docs/VIDEO_SCRIPT.md) · G2: make the repo public · G5: submit on Devpost (docs/DEVPOST.md)`);
