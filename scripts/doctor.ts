// `npm run doctor` — green/red checks for every dependency and env var. Prints NAMES, never values.
//   --offline   skip the PayPal / OpenAI network checks
import './_env';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createPayPalClient } from '../lib/paypal/client';
import { assertSandbox } from '../lib/paypal/sandbox-guard';

type Result = { ok: boolean | null; label: string; required: boolean };
const results: Result[] = [];
const pass = (label: string) => results.push({ ok: true, label, required: true });
const fail = (label: string, required = true) => results.push({ ok: false, label, required });
const skip = (label: string) => results.push({ ok: null, label, required: false });

const offline = process.argv.includes('--offline');
const env = process.env;
const has = (name: string) => Boolean(env[name]?.trim());

const REQUIRED = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'AG_STUDIO', 'AG_STUDIO_OPENAI_API_KEY', 'OPENAI_MODELS', 'DEMO_PASSCODE', 'PUBLIC_BASE_URL'];
const OPTIONAL: Record<string, string> = {
  PAYPAL_WEBHOOK_ID: 'set after the webhook is registered on the deployed URL',
  AGENT_MODEL: 'defaults to the first of OPENAI_MODELS',
  SESSION_SECRET: 'derived from DEMO_PASSCODE when empty',
  DEMO_VAULT_TOKEN_ID: 'deployed demo only',
  DEMO_VAULT_CUSTOMER_ID: 'deployed demo only',
  LAB_MAX_USD: 'defaults to 8',
  DAILY_OPENAI_USD_CAP: 'defaults to 2',
};

async function main() {
  // Runtime
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 12)) pass(`Node ${process.versions.node} (>= 22.12)`);
  else fail(`Node ${process.versions.node} is too old (need >= 22.12)`);

  // Sandbox guard
  try {
    assertSandbox();
    pass('PAYPAL_ENV=sandbox (API base fixed to api-m.sandbox.paypal.com)');
  } catch (e) {
    fail((e as Error).message);
  }

  // Env vars, by name
  for (const name of REQUIRED) (has(name) ? pass : fail)(`${name} ${has(name) ? 'is set' : 'is empty'}`);
  for (const [name, note] of Object.entries(OPTIONAL)) {
    if (has(name)) pass(`${name} is set`);
    else skip(`${name} not set (${note})`);
  }
  results.push({ ok: true, label: `OWNER_MODE=${env.OWNER_MODE === 'true' ? 'true (owner machine)' : 'false'}`, required: false });

  if (has('PUBLIC_BASE_URL')) {
    const url = env.PUBLIC_BASE_URL!.trim();
    let valid = false;
    try {
      valid = /^https?:$/.test(new URL(url).protocol) && !url.endsWith('/');
    } catch {}
    (valid ? pass : fail)(`PUBLIC_BASE_URL is ${valid ? 'an absolute URL without trailing slash' : 'not an absolute URL without trailing slash'}`);
  }

  // .env.local hygiene
  if (existsSync('.env.local')) {
    const mode = statSync('.env.local').mode & 0o777;
    (mode & 0o077 ? fail : pass)(`.env.local permissions ${mode.toString(8)}${mode & 0o077 ? ' (run: chmod 600 .env.local)' : ''}`, false);
    let tracked = false;
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', '.env.local'], { stdio: 'ignore' });
      tracked = true;
    } catch {}
    (tracked ? fail : pass)(`.env.local ${tracked ? 'IS TRACKED BY GIT — remove it now' : 'is not tracked by git'}`);
  } else {
    fail('.env.local missing (cp env.example .env.local)');
  }

  // Database
  try {
    mkdirSync('data', { recursive: true });
    const db = new Database('data/doctor-check.db');
    db.pragma('journal_mode = WAL');
    const v = db.prepare('select sqlite_version() as v').get() as { v: string };
    db.close();
    pass(`SQLite ${v.v} via better-sqlite3 (data/ writable, WAL)`);
  } catch (e) {
    fail(`SQLite: ${(e as Error).message}`);
  }

  // Tooling
  try {
    const hooks = execFileSync('git', ['config', 'core.hooksPath'], { encoding: 'utf8' }).trim();
    (hooks.includes('.husky') ? pass : fail)(`git hooks ${hooks.includes('.husky') ? 'installed (husky → secretlint + known-secrets)' : 'not installed (run: npx husky)'}`);
  } catch {
    fail('git hooks not installed (run: npx husky)');
  }
  try {
    execFileSync('gitleaks', ['version'], { stdio: 'ignore' });
    pass('gitleaks installed');
  } catch {
    fail('gitleaks not installed (brew install gitleaks)', false);
  }

  // Network checks
  if (offline) {
    skip('PayPal + OpenAI network checks skipped (--offline)');
  } else {
    if (has('PAYPAL_CLIENT_ID') && has('PAYPAL_CLIENT_SECRET')) {
      const ok = await createPayPalClient().checkCredentials();
      (ok ? pass : fail)(`PayPal sandbox OAuth ${ok ? 'token minted' : 'FAILED (check client id/secret, sandbox app)'}`);
    } else skip('PayPal sandbox OAuth (credentials not set yet)');

    if (has('AG_STUDIO_OPENAI_API_KEY')) {
      try {
        const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${env.AG_STUDIO_OPENAI_API_KEY}` } });
        if (!res.ok) fail(`OpenAI key rejected (HTTP ${res.status})`);
        else {
          const ids = new Set(((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id));
          pass(`OpenAI key valid (${ids.size} models visible)`);
          const wanted = (env.OPENAI_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          for (const m of wanted) (ids.has(m) ? pass : fail)(`OPENAI_MODELS: ${m} ${ids.has(m) ? 'available' : 'NOT available to this key'}`);
          if (has('AGENT_MODEL')) (ids.has(env.AGENT_MODEL!) ? pass : fail)(`AGENT_MODEL ${env.AGENT_MODEL} ${ids.has(env.AGENT_MODEL!) ? 'available' : 'NOT available'}`);
        }
      } catch (e) {
        fail(`OpenAI unreachable: ${(e as Error).message}`);
      }
    } else skip('OpenAI key check (AG_STUDIO_OPENAI_API_KEY not set yet)');
  }

  // Report
  console.log('\nALLOWANCE doctor\n');
  for (const r of results) {
    const mark = r.ok === true ? '\x1b[32m✓\x1b[0m' : r.ok === false ? (r.required ? '\x1b[31m✗\x1b[0m' : '\x1b[33m!\x1b[0m') : '\x1b[90m–\x1b[0m';
    console.log(`  ${mark} ${r.label}`);
  }
  const failures = results.filter((r) => r.ok === false && r.required).length;
  console.log(failures ? `\n${failures} required check(s) failing.\n` : '\nAll required checks green.\n');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(`doctor crashed: ${(e as Error).message}`);
  process.exitCode = 1;
});
