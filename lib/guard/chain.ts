// Hash-chained audit log. Every decision, capture, refund, approval and mandate change becomes an
// event { seq, at, type, payload, prevHash } with hash = SHA-256 of a canonical preimage.
//
// Tamper evidence: verification recomputes every hash from the stored fields AND checks the stored
// payload is in canonical form, so any single-byte change to any stored field is detected at its seq.
// The browser verifier (Chain Seal widget) uses WebCrypto over the same preimage.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const GENESIS_HASH = '0'.repeat(64);

export type ChainEvent = {
  seq: number;
  at: string;
  type: string;
  /** Canonical JSON of the payload, exactly as stored. */
  payload: string;
  prevHash: string;
  hash: string;
};

/** Deterministic JSON: sorted object keys, no whitespace, no undefined/functions/non-finite numbers. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value}`);
  }
}

/** The exact bytes that are hashed. Kept trivial so the browser verifier can reproduce it. */
export function preimage(e: Omit<ChainEvent, 'hash'>): string {
  return `${e.seq}\n${e.at}\n${e.type}\n${e.prevHash}\n${e.payload}`;
}

export function hashEvent(e: Omit<ChainEvent, 'hash'>): string {
  return bytesToHex(sha256(utf8ToBytes(preimage(e))));
}

/** Builds the next event after `prev` (undefined for the first event). */
export function nextEvent(prev: ChainEvent | undefined, input: { type: string; payload: unknown; at: string }): ChainEvent {
  const base = {
    seq: prev ? prev.seq + 1 : 1,
    at: input.at,
    type: input.type,
    payload: canonicalJson(input.payload),
    prevHash: prev ? prev.hash : GENESIS_HASH,
  };
  return { ...base, hash: hashEvent(base) };
}

export type ChainVerification = { ok: true; count: number; head: string } | { ok: false; count: number; brokenAt: number; reason: string };

export function verifyChain(events: readonly ChainEvent[]): ChainVerification {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const expectedSeq = i + 1;
    if (e.seq !== expectedSeq) return { ok: false, count: events.length, brokenAt: expectedSeq, reason: `expected seq ${expectedSeq}, found ${e.seq}` };
    if (e.prevHash !== prevHash) return { ok: false, count: events.length, brokenAt: e.seq, reason: 'prevHash does not match the previous event' };
    let canonical: string;
    try {
      canonical = canonicalJson(JSON.parse(e.payload));
    } catch {
      return { ok: false, count: events.length, brokenAt: e.seq, reason: 'payload is not valid JSON' };
    }
    if (canonical !== e.payload) return { ok: false, count: events.length, brokenAt: e.seq, reason: 'payload is not in canonical form' };
    if (hashEvent(e) !== e.hash) return { ok: false, count: events.length, brokenAt: e.seq, reason: 'hash does not match contents' };
    prevHash = e.hash;
  }
  return { ok: true, count: events.length, head: prevHash };
}

export interface ChainStore {
  last(): ChainEvent | undefined;
  append(event: ChainEvent): void;
  all(): ChainEvent[];
}

export function appendEvent(store: ChainStore, input: { type: string; payload: unknown; at: string }): ChainEvent {
  const event = nextEvent(store.last(), input);
  store.append(event);
  return event;
}

export class MemoryChainStore implements ChainStore {
  private readonly events: ChainEvent[] = [];
  last() {
    return this.events.at(-1);
  }
  append(event: ChainEvent) {
    this.events.push(event);
  }
  all() {
    return [...this.events];
  }
}
