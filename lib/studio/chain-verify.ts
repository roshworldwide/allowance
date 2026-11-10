// Browser-side verification of ALLOWANCE's audit chain with WebCrypto. Mirrors verifyChain in
// lib/guard/chain.ts check for check (seq, prevHash, canonical payload, hash), but hashes with
// crypto.subtle instead of @noble/hashes, so the seal is recomputed independently of the server's code
// path. canonicalJson is shared: it is pure, and "canonical" must mean exactly what the writer meant.

import { canonicalJson, GENESIS_HASH } from '@/lib/guard/chain';
import type { ChainEventRow } from './types';

export type ChainCheck = { ok: true; count: number; head: string } | { ok: false; count: number; brokenAt: number; reason: string };

/** The exact text that is hashed (same as preimage() in lib/guard/chain.ts). */
export const chainPreimage = (e: Omit<ChainEventRow, 'hash'>) => `${e.seq}\n${e.at}\n${e.type}\n${e.prevHash}\n${e.payload}`;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Events must be in seq order, starting at 1. */
export async function verifyChainWebCrypto(events: readonly ChainEventRow[]): Promise<ChainCheck> {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const fail = (brokenAt: number, reason: string): ChainCheck => ({ ok: false, count: events.length, brokenAt, reason });
    const expectedSeq = i + 1;
    if (e.seq !== expectedSeq) return fail(expectedSeq, `expected seq ${expectedSeq}, found ${e.seq}`);
    if (e.prevHash !== prevHash) return fail(e.seq, 'prevHash does not match the previous event');
    let canonical: string;
    try {
      canonical = canonicalJson(JSON.parse(e.payload));
    } catch {
      return fail(e.seq, 'payload is not valid JSON');
    }
    if (canonical !== e.payload) return fail(e.seq, 'payload is not in canonical form');
    if ((await sha256Hex(chainPreimage(e))) !== e.hash) return fail(e.seq, 'hash does not match contents');
    prevHash = e.hash;
  }
  return { ok: true, count: events.length, head: prevHash };
}
