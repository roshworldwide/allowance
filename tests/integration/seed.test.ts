// Replays seed the store on boot (the deployed disk is ephemeral). Synthetic previews never do.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mandatePreset, type TaskContract } from '@/lib/guard';
import { DEMO_PRESET } from '@/lib/guard/policy';
import { openDb } from '@/lib/store/db';
import { getContract, insertContract, insertMandate, listDecisions } from '@/lib/store/repo';
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

  it('a live contract can reuse line ids ("L1", "L2") that an imported replay already used', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'replays-'));
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ ...preview, meta: { ...preview.meta, synthetic: false, id: 'test-run-2' } }));
    const db = openDb(':memory:');
    expect(importReplays(db, dir)).toBe(1);
    const mandate = mandatePreset({ id: 'mnd_live', now: new Date('2026-11-11T04:00:00Z'), vaultLinked: true, preset: DEMO_PRESET });
    insertMandate(db, mandate);
    const lines = preview.meta.contract.lines as TaskContract['lines'];
    expect(lines.some((l) => l.id === 'L1')).toBe(true);
    insertContract(db, { id: 'tc_live', mandateId: mandate.id, confirmedAt: null, lines }, 'same task again');
    expect(getContract(db, 'tc_live')!.lines.map((l) => l.id)).toEqual(lines.map((l) => l.id));
  });

  it('never imports synthetic previews', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'replays-'));
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify(preview));
    expect(importReplays(openDb(':memory:'), dir)).toBe(0);
  });
});
