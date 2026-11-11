import { describe, expect, it } from 'vitest';
import { clientIp } from '@/lib/security/access';

const req = (headers: Record<string, string>) => new Request('https://x.test/api/auth/passcode', { method: 'POST', headers });

describe('clientIp: a client cannot pick its own rate-limit bucket', () => {
  it('ignores a forged first X-Forwarded-For entry and uses the hop the proxy appended', () => {
    expect(clientIp(req({ 'x-forwarded-for': '10.0.0.1, 203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req({ 'x-forwarded-for': '10.0.0.2, 203.0.113.7' }))).toBe('203.0.113.7');
  });
  it('prefers the edge headers Cloudflare overwrites', () => {
    expect(clientIp(req({ 'true-client-ip': '198.51.100.4', 'x-forwarded-for': '10.0.0.1, 162.158.0.1' }))).toBe('198.51.100.4');
    expect(clientIp(req({ 'cf-connecting-ip': '198.51.100.5', 'x-forwarded-for': '10.0.0.1' }))).toBe('198.51.100.5');
  });
  it('falls back to X-Real-IP, then local', () => {
    expect(clientIp(req({ 'x-real-ip': '192.0.2.9' }))).toBe('192.0.2.9');
    expect(clientIp(req({}))).toBe('local');
  });
});
