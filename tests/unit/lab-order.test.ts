import { afterEach, describe, expect, it } from 'vitest';
import { fairOrder, labJobs } from '@/lib/lab/order';
import { estimateUsd, priceFor } from '@/lib/security/access';

const FAMILIES = Array.from({ length: 12 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`);
const mk = (family: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${family}-${String(i + 1).padStart(2, '0')}`, family }));
// The real corpus shape: 12 attack families × 5, then 40 benign errands, in file order.
const CORPUS = [...FAMILIES.flatMap((f) => mk(f, 5)), ...mk('BENIGN', 40)];

describe('Attack Lab job order', () => {
  it('keeps every scenario exactly once', () => {
    const order = fairOrder(CORPUS);
    expect(order).toHaveLength(100);
    expect(new Set(order.map((s) => s.id)).size).toBe(100);
  });

  it('a short prefix already covers every attack family and benign errands', () => {
    const head = fairOrder(CORPUS).slice(0, 20);
    for (const f of FAMILIES) expect(head.some((s) => s.family === f)).toBe(true);
    expect(head.filter((s) => s.family === 'BENIGN').length).toBeGreaterThanOrEqual(6);
  });

  it('is seed-major: every scenario runs once (both configs) before any second seed', () => {
    const jobs = labJobs(CORPUS, 3);
    expect(jobs).toHaveLength(600);
    expect(jobs.slice(0, 200).every((j) => j.seed === 1)).toBe(true);
    expect(jobs.slice(0, 2).map((j) => j.config)).toEqual(['unguarded', 'guarded']);
    expect(jobs[0]!.scenario).toBe(jobs[1]!.scenario);
  });
});

describe('OpenAI cost estimate', () => {
  afterEach(() => {
    delete process.env.OPENAI_PRICE_INPUT_PER_M;
  });

  it('prices known models from the table, snapshots included', () => {
    expect(priceFor('gpt-5.4-mini')).toMatchObject({ input: 0.75, cached: 0.075, output: 4.5 });
    expect(priceFor('gpt-5.4-mini-2026-03-17').input).toBe(0.75);
    // 1M fresh input + 1M output on gpt-5.4-mini = $0.75 + $4.50
    expect(estimateUsd({ inputTokens: 1_000_000, cachedTokens: 0, outputTokens: 1_000_000 }, 'gpt-5.4-mini')).toBeCloseTo(5.25);
  });

  it('falls back to the gpt-5 list price for unknown models, and says so', () => {
    const p = priceFor('gpt-6.1-terra');
    expect(p).toMatchObject({ input: 1.25, cached: 0.125, output: 10 });
    expect(p.source).toMatch(/not in the price table/);
    expect(priceFor().input).toBe(1.25);
  });

  it('OPENAI_PRICE_* overrides every model', () => {
    process.env.OPENAI_PRICE_INPUT_PER_M = '2';
    expect(priceFor('gpt-5.4-mini')).toMatchObject({ input: 2, cached: 0.125, output: 10, source: 'OPENAI_PRICE_*_PER_M' });
  });
});
