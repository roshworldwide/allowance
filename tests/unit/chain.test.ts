import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, MemoryChainStore, appendEvent, canonicalJson, nextEvent, verifyChain, type ChainEvent } from '@/lib/guard';
import { openDb } from '@/lib/store/db';
import { SqliteChainStore } from '@/lib/store/sqlite-chain';

function chain(n: number): ChainEvent[] {
  const store = new MemoryChainStore();
  for (let i = 0; i < n; i++) appendEvent(store, { type: i % 2 ? 'decision' : 'capture', payload: { i, amountCents: i * 100, note: `event ${i}` }, at: `2026-11-11T10:00:${String(i).padStart(2, '0')}.000Z` });
  return store.all();
}

describe('canonicalJson', () => {
  it('sorts keys at every depth and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  });
  it('rejects non-finite numbers and functions', () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
    expect(() => canonicalJson({ f: () => 1 })).toThrow();
  });
});

describe('hash chain', () => {
  it('starts at genesis and links every event to the previous hash', () => {
    const events = chain(5);
    expect(events[0]!.prevHash).toBe(GENESIS_HASH);
    for (let i = 1; i < events.length; i++) expect(events[i]!.prevHash).toBe(events[i - 1]!.hash);
    expect(verifyChain(events)).toEqual({ ok: true, count: 5, head: events[4]!.hash });
  });

  it('an empty chain verifies', () => {
    expect(verifyChain([])).toEqual({ ok: true, count: 0, head: GENESIS_HASH });
  });

  it('detects an edited amount at the right seq', () => {
    const events = chain(6);
    events[3] = { ...events[3]!, payload: events[3]!.payload.replace('"amountCents":300', '"amountCents":30000') };
    const v = verifyChain(events);
    expect(v).toMatchObject({ ok: false, brokenAt: 4, reason: 'hash does not match contents' });
  });

  it('detects whitespace-only edits (non-canonical payload)', () => {
    const events = chain(3);
    events[1] = { ...events[1]!, payload: events[1]!.payload.replace(':', ': ') };
    expect(verifyChain(events)).toMatchObject({ ok: false, brokenAt: 2, reason: 'payload is not in canonical form' });
  });

  it('detects a deleted event', () => {
    const events = chain(5);
    events.splice(2, 1);
    expect(verifyChain(events)).toMatchObject({ ok: false, brokenAt: 3 });
  });

  it('detects a re-hashed forgery (attacker recomputes one hash but not the next link)', () => {
    const events = chain(4);
    const forged = nextEvent(events[0], { type: 'decision', payload: { i: 1, amountCents: 1, note: 'forged' }, at: events[1]!.at });
    events[1] = forged;
    expect(verifyChain(events)).toMatchObject({ ok: false, brokenAt: 3, reason: 'prevHash does not match the previous event' });
  });

  it('SQLite store: atomic appends verify', () => {
    const store = new SqliteChainStore(openDb(':memory:'));
    for (let i = 0; i < 10; i++) store.record('decision', { i });
    const v = verifyChain(store.all());
    expect(v.ok).toBe(true);
    expect(v.count).toBe(10);
  });
});
