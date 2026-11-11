// Abuse protection for the public demo:
//   - live runs and Studio chat require the demo passcode → httpOnly signed session cookie
//   - per-IP token bucket on /api/agent/*, /api/ai/*, /api/allowance/*
//   - global daily OpenAI spend estimate with a hard cap (DAILY_OPENAI_USD_CAP)
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'allowance_session';
const SESSION_TTL_MS = 12 * 3_600_000;

function key(): string {
  const secret = process.env.SESSION_SECRET || process.env.DEMO_PASSCODE;
  if (!secret) throw new Error('DEMO_PASSCODE (or SESSION_SECRET) must be set');
  return createHmac('sha256', 'allowance-session-v1').update(secret).digest('hex');
}

const sign = (payload: string) => createHmac('sha256', key()).update(payload).digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checks a submitted passcode in constant time. */
export function passcodeMatches(attempt: string): boolean {
  const real = process.env.DEMO_PASSCODE;
  if (!real || !attempt) return false;
  const h = (s: string) => createHmac('sha256', 'pc').update(s).digest();
  return timingSafeEqual(h(attempt.trim()), h(real.trim()));
}

/** A signed session token: "<sessionId>.<expiresMs>.<sig>". */
export function issueSession(now = Date.now()): { token: string; sessionId: string; maxAgeSec: number } {
  const sessionId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const payload = `${sessionId}.${now + SESSION_TTL_MS}`;
  return { token: `${payload}.${sign(payload)}`, sessionId, maxAgeSec: SESSION_TTL_MS / 1000 };
}

export function readSession(token: string | undefined, now = Date.now()): { sessionId: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [sessionId, exp, sig] = parts as [string, string, string];
  try {
    if (!safeEqual(sig, sign(`${sessionId}.${exp}`))) return null;
  } catch {
    return null;
  }
  return Number(exp) > now ? { sessionId } : null;
}

/** Live mode = owner machine, or a valid passcode session. */
export function liveAccess(cookieValue: string | undefined): { ok: true; sessionId: string; owner: boolean } | { ok: false } {
  if (process.env.OWNER_MODE === 'true') return { ok: true, sessionId: 'owner', owner: true };
  const s = readSession(cookieValue);
  return s ? { ok: true, sessionId: s.sessionId, owner: false } : { ok: false };
}

// --- Rate limiting: token bucket per (bucket, ip) ------------------------------------------------
type Bucket = { tokens: number; at: number };
const buckets = new Map<string, Bucket>();
const LIMITS: Record<string, { capacity: number; perMinute: number }> = {
  agent: { capacity: 4, perMinute: 2 },
  ai: { capacity: 30, perMinute: 15 },
  allowance: { capacity: 30, perMinute: 30 },
  auth: { capacity: 5, perMinute: 3 },
  webhook: { capacity: 60, perMinute: 60 },
};
const MAX_BUCKETS = 10_000;

export function rateLimit(name: keyof typeof LIMITS, ip: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const l = LIMITS[name]!;
  const k = `${name}:${ip}`;
  const b = buckets.get(k) ?? { tokens: l.capacity, at: now };
  b.tokens = Math.min(l.capacity, b.tokens + ((now - b.at) / 60_000) * l.perMinute);
  b.at = now;
  const ok = b.tokens >= 1;
  if (ok) b.tokens -= 1;
  buckets.set(k, b);
  if (buckets.size > MAX_BUCKETS) evictBuckets(now);
  return ok ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.ceil(((1 - b.tokens) / l.perMinute) * 60) };
}

/** Over the cap, forget the clients with the most allowance left: a throttled client is never the one forgotten. */
function evictBuckets(now: number) {
  const fill = (k: string, b: Bucket) => {
    const l = LIMITS[k.slice(0, k.indexOf(':'))]!;
    return Math.min(l.capacity, b.tokens + ((now - b.at) / 60_000) * l.perMinute) / l.capacity;
  };
  const fullest = [...buckets].map(([k, b]) => [k, fill(k, b)] as const).sort((x, y) => y[1] - x[1]);
  for (const [k] of fullest.slice(0, buckets.size - Math.floor(MAX_BUCKETS * 0.9))) buckets.delete(k);
}

/**
 * The caller's IP for rate limiting. Render's proxy appends to X-Forwarded-For without clearing what the
 * client sent, so the FIRST entry is forgeable (verified on the live service: six wrong passcodes with six
 * different fake X-Forwarded-For values were never limited). Order of trust:
 *  1. True-Client-IP / CF-Connecting-IP — set by Cloudflare at the edge in front of *.onrender.com,
 *     overwriting anything the client sent;
 *  2. the LAST X-Forwarded-For entry — the address the nearest proxy actually saw;
 *  3. X-Real-IP, then 'local' (dev server, tests).
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const edge = h.get('true-client-ip')?.trim() || h.get('cf-connecting-ip')?.trim();
  if (edge) return edge;
  const xff = h.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean);
  return xff?.at(-1) || h.get('x-real-ip')?.trim() || 'local';
}

// --- Daily OpenAI spend cap ----------------------------------------------------------------------
// Estimated from token usage. On cap → replay mode. USD per 1M tokens, OpenAI standard tier, from the
// model pages on developers.openai.com (checked 11 Nov 2026). A model not in the table is priced at the
// gpt-5 list price; OPENAI_PRICE_{INPUT,CACHED,OUTPUT}_PER_M override every model.
type Price = { input: number; cached: number; output: number };
const KNOWN_PRICES: Record<string, Price> = {
  'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.5 },
  'gpt-5-mini': { input: 0.25, cached: 0.025, output: 2 },
};
const FALLBACK_PRICE: Price = { input: 1.25, cached: 0.125, output: 10 };
let spend = { day: '', usd: 0 };
let quotaExhausted = false;

/** The per-1M prices used for `model` (dated snapshots resolve to their alias), and where they came from. */
export function priceFor(model?: string): Price & { source: string } {
  const env = process.env;
  if (env.OPENAI_PRICE_INPUT_PER_M || env.OPENAI_PRICE_CACHED_PER_M || env.OPENAI_PRICE_OUTPUT_PER_M) {
    const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
    return {
      input: num(env.OPENAI_PRICE_INPUT_PER_M, FALLBACK_PRICE.input),
      cached: num(env.OPENAI_PRICE_CACHED_PER_M, FALLBACK_PRICE.cached),
      output: num(env.OPENAI_PRICE_OUTPUT_PER_M, FALLBACK_PRICE.output),
      source: 'OPENAI_PRICE_*_PER_M',
    };
  }
  const alias = model?.trim().replace(/-\d{4}-\d{2}-\d{2}$/, '');
  const known = alias ? KNOWN_PRICES[alias] : undefined;
  return known ? { ...known, source: `${alias} list price` } : { ...FALLBACK_PRICE, source: `${alias || 'unknown model'} not in the price table: gpt-5 list price assumed` };
}

export function estimateUsd(u: { inputTokens: number; cachedTokens: number; outputTokens: number }, model?: string): number {
  const p = priceFor(model);
  return ((u.inputTokens - u.cachedTokens) * p.input + u.cachedTokens * p.cached + u.outputTokens * p.output) / 1_000_000;
}

export function recordSpend(usd: number, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if (spend.day !== day) spend = { day, usd: 0 };
  spend.usd += usd;
}

/** Call when OpenAI answers insufficient_quota / 429: the app switches to replay mode. */
export function markQuotaExhausted() {
  quotaExhausted = true;
}

export function aiBudget(now = new Date()): { ok: boolean; spentUsd: number; capUsd: number; reason?: string } {
  const capUsd = Number(process.env.DAILY_OPENAI_USD_CAP ?? 2);
  const day = now.toISOString().slice(0, 10);
  const spentUsd = spend.day === day ? spend.usd : 0;
  if (quotaExhausted) return { ok: false, spentUsd, capUsd, reason: 'OpenAI quota exhausted — replay mode' };
  if (spentUsd >= capUsd) return { ok: false, spentUsd, capUsd, reason: 'Daily AI budget reached — replay mode' };
  return { ok: true, spentUsd, capUsd };
}
