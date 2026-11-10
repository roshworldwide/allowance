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
};

export function rateLimit(name: keyof typeof LIMITS, ip: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const l = LIMITS[name]!;
  const k = `${name}:${ip}`;
  const b = buckets.get(k) ?? { tokens: l.capacity, at: now };
  b.tokens = Math.min(l.capacity, b.tokens + ((now - b.at) / 60_000) * l.perMinute);
  b.at = now;
  if (buckets.size > 10_000) buckets.clear();
  if (b.tokens < 1) {
    buckets.set(k, b);
    return { ok: false, retryAfterSec: Math.ceil(((1 - b.tokens) / l.perMinute) * 60) };
  }
  b.tokens -= 1;
  buckets.set(k, b);
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

// --- Daily OpenAI spend cap ----------------------------------------------------------------------
// Estimated from token usage with conservative per-1M prices (env-overridable). On cap → replay mode.
const PRICE = {
  input: Number(process.env.OPENAI_PRICE_INPUT_PER_M ?? 1.25),
  cached: Number(process.env.OPENAI_PRICE_CACHED_PER_M ?? 0.125),
  output: Number(process.env.OPENAI_PRICE_OUTPUT_PER_M ?? 10),
};
let spend = { day: '', usd: 0 };
let quotaExhausted = false;

export function estimateUsd(u: { inputTokens: number; cachedTokens: number; outputTokens: number }): number {
  return ((u.inputTokens - u.cachedTokens) * PRICE.input + u.cachedTokens * PRICE.cached + u.outputTokens * PRICE.output) / 1_000_000;
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
