// Replays seed the store on boot (the deployed disk is ephemeral). Synthetic previews never do.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '@/lib/store/db';
import { listDecisions } from '@/lib/store/repo';
import { importReplays } from '@/lib/store/seed';
import { SqliteLedger } from '@/lib/store/sqlite-ledger';

const preview = JSON.parse(readFileSync('tests/fixtures/replay-preview.json', 'utf8'));

describe('importReplays', () => {
  it('imports a recorded run: decisions with their status, captures, the refund and the ledger', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'replays-'));
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ ...preview, meta: { ...preview.meta, synthetic: false, id: 'test-run' } }));
    const db = openDb(':memory:');
    expect(importReplays(db, dir)).toBe(1);
    const ds = listDecisions(db);
    expect(ds.map((d) => `${d.verdict}:${d.status}:${d.source}`)).toEqual(['ALLOW:REFUNDED:replay', 'BLOCK:BLOCKED:replay', 'STEP_UP:EXECUTED:replay']);
    const mandateId = ds[0]!.mandate_id;
    expect(new SqliteLedger(db).totals(mandateId)).toEqual({ committedCents: 4800, reservedCents: 0 });
    expect(importReplays(db, dir)).toBe(0); // idempotent
  });

  it('never imports synthetic previews', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'replays-'));
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify(preview));
    expect(importReplays(openDb(':memory:'), dir)).toBe(0);
  });
});
