import { describe, expect, it } from 'vitest';
import { istDayMonth, istStamp } from '@/lib/time';

describe('IST labels (deterministic, no locale/time-zone drift)', () => {
  it('formats a morning stamp in IST', () => {
    expect(istStamp('2026-11-11T03:43:17.547Z')).toBe('11 Nov, 09:13 AM');
  });
  it('handles noon, midnight and the day boundary', () => {
    expect(istStamp('2026-11-11T06:30:00Z')).toBe('11 Nov, 12:00 PM');
    expect(istStamp('2026-11-10T18:30:00Z')).toBe('11 Nov, 12:00 AM');
    expect(istDayMonth('2026-11-30T23:59:59.000Z')).toBe('1 Dec');
    expect(istDayMonth('2026-11-30T18:29:59.000Z')).toBe('30 Nov');
  });
});
