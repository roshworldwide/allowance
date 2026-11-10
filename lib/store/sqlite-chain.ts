// Hash-chain persistence. Appends read the head and insert inside one IMMEDIATE transaction so two
// concurrent appends can never fork the chain.
import { appendEvent, type ChainEvent, type ChainStore } from '@/lib/guard/chain';
import type { Db } from './db';

type Row = { seq: number; at: string; type: string; payload: string; prev_hash: string; hash: string };
const toEvent = (r: Row): ChainEvent => ({ seq: r.seq, at: r.at, type: r.type, payload: r.payload, prevHash: r.prev_hash, hash: r.hash });

export class SqliteChainStore implements ChainStore {
  private readonly lastStmt;
  private readonly allStmt;
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.lastStmt = db.prepare<[], Row>('SELECT * FROM chain_events ORDER BY seq DESC LIMIT 1');
    this.allStmt = db.prepare<[], Row>('SELECT * FROM chain_events ORDER BY seq ASC');
    this.insertStmt = db.prepare('INSERT INTO chain_events (seq, at, type, payload, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)');
  }

  last() {
    const r = this.lastStmt.get();
    return r ? toEvent(r) : undefined;
  }
  append(e: ChainEvent) {
    this.insertStmt.run(e.seq, e.at, e.type, e.payload, e.prevHash, e.hash);
  }
  all() {
    return this.allStmt.all().map(toEvent);
  }

  /** Atomic append: head read + insert under one write lock. */
  record(type: string, payload: unknown, at = new Date().toISOString()): ChainEvent {
    return this.db.transaction(() => appendEvent(this, { type, payload, at })).immediate();
  }
}
