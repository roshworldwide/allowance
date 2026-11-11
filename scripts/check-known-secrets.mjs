#!/usr/bin/env node
// Known-secret scanner. Reads the real secret VALUES from .env.local (or the process env) and checks
// that none of them appears in: staged changes (--staged), the full git history (--history), the
// production build output (--build), or any directory (--dir <path>). Prints variable NAMES only.
//
// secretlint catches secrets by pattern; this catches *our* secrets by value, including formats no
// pattern knows (AG Studio licence, demo passcode, vault token ids).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SENSITIVE = [
  'PAYPAL_CLIENT_SECRET',
  'AG_STUDIO_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'DEMO_PASSCODE',
  'SESSION_SECRET',
  'DEMO_VAULT_TOKEN_ID',
  'DEMO_VAULT_CUSTOMER_ID',
  'ELEVENLABS_API_KEY', // demo-video voice clone only (scripts/video/voiceclone.ts)
  'AG_STUDIO', // allowed in the client bundle (it unlocks Studio in the browser) but never in git
];
// The AG Studio licence is client-visible by design, so the build scan skips it.
const BUILD_ALLOWED = new Set(['AG_STUDIO']);

function loadValues() {
  const values = {};
  const file = '.env.local';
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      values[m[1]] = v;
    }
  }
  for (const name of SENSITIVE) if (process.env[name]) values[name] = process.env[name];
  // Ignore empty and very short values: they would match by accident.
  return SENSITIVE.map((name) => [name, values[name]]).filter(([, v]) => typeof v === 'string' && v.length >= 8);
}

function scanText(text, secrets, where, hits) {
  for (const [name, value] of secrets) if (text.includes(value)) hits.add(`${name} found in ${where}`);
}

function walk(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, visit);
    else if (s.size < 20 * 1024 * 1024) visit(p);
  }
}

const mode = process.argv[2] ?? '--staged';
const secrets = loadValues();
const hits = new Set();

if (secrets.length === 0) {
  console.log('known-secrets: no secret values configured yet; nothing to compare against (ok).');
  process.exit(0);
}

if (mode === '--staged') {
  const diff = execFileSync('git', ['diff', '--cached', '-U0', '--no-color'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  scanText(diff, secrets, 'staged changes', hits);
} else if (mode === '--history') {
  const log = execFileSync('git', ['log', '-p', '--all', '--no-color'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  scanText(log, secrets, 'git history', hits);
} else if (mode === '--build' || mode === '--dir') {
  const dir = mode === '--build' ? '.next' : process.argv[3];
  if (!dir || !existsSync(dir)) {
    console.error(`known-secrets: ${dir ?? '(no dir)'} does not exist`);
    process.exit(2);
  }
  const list = mode === '--build' ? secrets.filter(([n]) => !BUILD_ALLOWED.has(n)) : secrets;
  walk(dir, (p) => {
    // Server-side files legitimately hold nothing secret either: env values are read at runtime.
    scanText(readFileSync(p, 'latin1'), list, p, hits);
  });
} else {
  console.error('usage: check-known-secrets.mjs [--staged | --history | --build | --dir <path>]');
  process.exit(2);
}

if (hits.size > 0) {
  console.error('known-secrets: BLOCKED. A configured secret value appears in:');
  for (const h of hits) console.error(`  - ${h}`);
  process.exit(1);
}
console.log(`known-secrets: clean (${secrets.length} configured values checked, ${mode}).`);
