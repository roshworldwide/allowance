import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aiBudget, estimateUsd, issueSession, liveAccess, passcodeMatches, rateLimit, readSession, recordSpend } from '@/lib/security/access';

beforeEach(() => {
  process.env.DEMO_PASSCODE = 'correct horse battery staple';
  process.env.OWNER_MODE = 'false';
});
afterEach(() => {
  delete process.env.DEMO_PASSCODE;
});

describe('passcode session', () => {
  it('accepts only the right passcode', () => {
    expect(passcodeMatches('correct horse battery staple')).toBe(true);
    expect(passcodeMatches('wrong')).toBe(false);
    expect(passcodeMatches('')).toBe(false);
  });
  it('issues a signed session that verifies, and rejects tampering and expiry', () => {
    const s = issueSession(1_000);
    expect(readSession(s.token, 2_000)?.sessionId).toBe(s.sessionId);
    expect(readSession(s.token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), 2_000)).toBeNull();
    expect(readSession(s.token, 1_000 + 13 * 3_600_000)).toBeNull();
    expect(liveAccess(undefined).ok).toBe(false);
  });
  it('owner mode grants live access without a cookie', () => {
    process.env.OWNER_MODE = 'true';
    expect(liveAccess(undefined)).toMatchObject({ ok: true, owner: true });
  });
});

describe('rate limit and spend cap', () => {
  it('token bucket blocks bursts and refills over time', () => {
    const t = 5_000_000;
    const r = Array.from({ length: 6 }, () => rateLimit('agent', '9.9.9.9', t).ok);
    expect(r).toEqual([true, true, true, true, false, false]);
    expect(rateLimit('agent', '9.9.9.9', t + 60_000).ok).toBe(true);
  });
  it('daily cap switches AI off once reached', () => {
    process.env.DAILY_OPENAI_USD_CAP = '0.01';
    const d = new Date('2030-01-01T00:00:00Z');
    expect(aiBudget(d).ok).toBe(true);
    recordSpend(estimateUsd({ inputTokens: 10_000, cachedTokens: 0, outputTokens: 1_000 }), d);
    expect(aiBudget(d).ok).toBe(false);
  });
});
