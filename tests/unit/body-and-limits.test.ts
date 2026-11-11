import { describe, expect, it } from 'vitest';
import { rateLimit } from '@/lib/security/access';
import { readBodyText, readJsonObject } from '@/lib/security/body';

const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request('http://local/x', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);

describe('bounded request bodies', () => {
  it('reads a body within the limit', async () => {
    expect(await readBodyText(post('{"a":1}'), 100)).toEqual({ ok: true, text: '{"a":1}' });
  });

  it('refuses a declared Content-Length over the limit', async () => {
    expect(await readBodyText(post('x'.repeat(10), { 'content-length': '5000000' }), 1000)).toEqual({ ok: false });
  });

  it('stops reading a streamed body as soon as it passes the limit (an endless body cannot hang it)', async () => {
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(c) {
        sent += 1024;
        c.enqueue(new Uint8Array(1024));
      },
    });
    expect(await readBodyText(post(endless), 10_000)).toEqual({ ok: false });
    expect(sent).toBeLessThan(20_000);
  });

  it('readJsonObject: objects only; null, arrays, strings and invalid JSON give null', async () => {
    expect(await readJsonObject(post('{"passcode":"x"}'), 100)).toEqual({ tooLarge: false, value: { passcode: 'x' } });
    for (const b of ['null', '[1]', '"s"', '{not json', '']) expect(await readJsonObject(post(b), 100)).toEqual({ tooLarge: false, value: null });
    expect(await readJsonObject(post('x'.repeat(200)), 100)).toEqual({ tooLarge: true });
  });
});

describe('rate limiter under a flood of new clients', () => {
  it('a throttled client stays throttled when 10,500 other clients show up', () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit('auth', 'attacker', t).ok).toBe(true);
    expect(rateLimit('auth', 'attacker', t).ok).toBe(false);
    for (let i = 0; i < 10_500; i++) rateLimit('auth', `client-${i}`, t);
    expect(rateLimit('auth', 'attacker', t).ok).toBe(false);
  });

  it('a client forgotten while idle comes back with a full allowance', () => {
    const t = 5_000_000;
    rateLimit('auth', 'idle-client', t);
    for (let i = 0; i < 10_500; i++) rateLimit('auth', `later-${i}`, t + 3_600_000);
    const later = Array.from({ length: 6 }, () => rateLimit('auth', 'idle-client', t + 3_600_000).ok);
    expect(later).toEqual([true, true, true, true, true, false]);
  });
});
