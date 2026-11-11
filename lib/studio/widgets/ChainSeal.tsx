'use client';

// Chain Seal: a custom AG Studio widget that re-verifies ALLOWANCE's hash-chained audit log in the
// browser. It reads every event through Studio, recomputes each SHA-256 hash with WebCrypto exactly as
// lib/guard/chain.ts does, checks each payload is canonical JSON, and shows the result as a seal plus
// the latest events. Colour is never the only signal: the seal says "verified" or "broken at seq k"
// in words, with an icon character, and the broken event is marked in the list.

import { use, useEffect, useState, type CSSProperties } from 'react';
import type { AgDataMappingDefinition, AgWidgetField, AgWidgetParams } from 'ag-studio';
import { AgIncompleteDataMappingOverlay } from 'ag-studio-react';
import { verifyChainWebCrypto, type ChainCheck } from '../chain-verify';
import type { ChainSealDefinition, ChainSealWidget } from '../registry';
import type { ChainEventRow } from '../types';

const DEFAULTS = { showLast: 5, showHashes: true };
type Slot = keyof ChainSealWidget['dataMapping'];
const SLOTS: Slot[] = ['seq', 'at', 'type', 'payload', 'prevHash', 'hash'];

export function ChainSeal({ widgetApi, dataMapping, format }: AgWidgetParams<ChainSealWidget>) {
  const style = { ...DEFAULTS, ...format?.style };
  const bound = SLOTS.map((slot) => dataMapping[slot]?.[0]);
  if (bound.some((f) => f === undefined)) return <AgIncompleteDataMappingOverlay />;
  const [seq, at, type, payload, prevHash, hash] = bound as AgWidgetField[];

  // Every event, in order: the chain is only verifiable whole. Cross filters from other widgets are
  // ignored for the same reason.
  const response = use(widgetApi.getData({ fields: [seq!, at!, type!, payload!, prevHash!, hash!], sort: [{ field: seq!, direction: 'asc' }] }, { crossFilter: 'none' }));
  const rows = response.results.rows;
  return <SealBody rows={rows} keys={{ seq: seq!.key, at: at!.key, type: type!.key, payload: payload!.key, prevHash: prevHash!.key, hash: hash!.key }} showLast={style.showLast} showHashes={style.showHashes} />;
}

type Keys = Record<Slot, string>;

function SealBody({ rows, keys, showLast, showHashes }: { rows: Record<string, unknown>[]; keys: Keys; showLast: number; showHashes: boolean }) {
  // WebCrypto is async: verify after render, and only show a result for the rows it was computed on.
  const [result, setResult] = useState<{ rows: unknown; check: ChainCheck } | null>(null);
  // `keys` is rebuilt by the parent on every render; depend on its contents, not its identity.
  const keySig = JSON.stringify(keys);
  useEffect(() => {
    let live = true;
    const k = JSON.parse(keySig) as Keys;
    const events: ChainEventRow[] = rows.map((r) => ({
      seq: Number(r[k.seq]),
      at: String(r[k.at] ?? ''),
      type: String(r[k.type] ?? ''),
      payload: String(r[k.payload] ?? ''),
      prevHash: String(r[k.prevHash] ?? ''),
      hash: String(r[k.hash] ?? ''),
    }));
    verifyChainWebCrypto(events).then(
      (check) => live && setResult({ rows, check }),
      (error: unknown) => live && setResult({ rows, check: { ok: false, count: events.length, brokenAt: 0, reason: `could not verify: ${String(error)}` } }),
    );
    return () => {
      live = false;
    };
  }, [rows, keySig]);
  const check = result?.rows === rows ? result.check : undefined;

  const count = Math.min(rows.length, Math.max(1, Math.round(showLast || DEFAULTS.showLast)));
  const latest = rows.slice(-count).reverse();
  const brokenAt = check && !check.ok ? check.brokenAt : undefined;

  return (
    // Scrolls as the event list grows; focusable so keyboard users can scroll it too.
    <div style={s.root} tabIndex={0} role="region" aria-label="Audit chain">
      <Seal check={check} total={rows.length} />
      {latest.length > 0 && (
        <ol style={s.list} aria-label="Latest audit events, newest first">
          {latest.map((r) => {
            const seqValue = Number(r[keys.seq]);
            const broken = seqValue === brokenAt;
            return (
              <li key={seqValue} style={{ ...s.event, ...(broken ? s.brokenEvent : {}) }}>
                <span style={s.seq}>#{seqValue}</span>
                <span style={s.type}>{String(r[keys.type] ?? '')}</span>
                <span style={s.time}>{shortTime(String(r[keys.at] ?? ''))}</span>
                {showHashes && <span style={s.hash}>{String(r[keys.hash] ?? '').slice(0, 8)}</span>}
                {broken && (
                  <span style={s.brokenTag}>
                    <span aria-hidden>✕ </span>broken here
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Seal({ check, total }: { check: ChainCheck | undefined; total: number }) {
  if (total === 0) {
    return (
      <div style={{ ...s.seal, borderColor: 'var(--al-line)' }} role="status">
        <span style={{ ...s.mark, color: 'var(--al-muted)', borderColor: 'var(--al-line)' }} aria-hidden>
          –
        </span>
        <span>
          <strong style={s.title}>No events recorded yet</strong>
          <span style={s.sub}>The chain starts with the first allowance change or decision.</span>
        </span>
      </div>
    );
  }
  if (!check) {
    return (
      <div style={{ ...s.seal, borderColor: 'var(--al-line)' }} role="status">
        <span style={{ ...s.mark, color: 'var(--al-muted)', borderColor: 'var(--al-line)' }} aria-hidden>
          …
        </span>
        <span>
          <strong style={s.title}>Verifying {total} events…</strong>
          <span style={s.sub}>Recomputing every SHA-256 hash in this browser</span>
        </span>
      </div>
    );
  }
  if (check.ok) {
    return (
      <div style={{ ...s.seal, borderColor: 'var(--al-allow)', background: 'color-mix(in srgb, var(--al-allow) 10%, transparent)' }} role="status">
        <span style={{ ...s.mark, color: 'var(--al-allow)', borderColor: 'var(--al-allow)' }} aria-hidden>
          ✓
        </span>
        <span>
          <strong style={{ ...s.title, color: 'var(--al-allow)' }}>Chain verified</strong>
          <span style={s.sub}>
            {check.count} events · head <code style={s.code}>{check.head.slice(0, 12)}</code>
          </span>
          <span style={s.note}>Recomputed in this browser with WebCrypto SHA-256</span>
        </span>
      </div>
    );
  }
  return (
    <div style={{ ...s.seal, borderColor: 'var(--al-block)', background: 'color-mix(in srgb, var(--al-block) 10%, transparent)' }} role="alert">
      <span style={{ ...s.mark, color: 'var(--al-block)', borderColor: 'var(--al-block)' }} aria-hidden>
        ✕
      </span>
      <span>
        <strong style={{ ...s.title, color: 'var(--al-block)' }}>Broken at seq {check.brokenAt}</strong>
        <span style={s.sub}>{check.reason}</span>
        <span style={s.note}>Events from seq {check.brokenAt} on cannot be trusted</span>
      </span>
    </div>
  );
}

function shortTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const mono = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace';

const s = {
  root: { height: '100%', width: '100%', overflowY: 'auto', color: 'var(--al-text)', display: 'grid', alignContent: 'start', gap: 10, padding: 2 },
  seal: { display: 'flex', gap: 12, alignItems: 'center', border: '1.5px solid', borderRadius: 12, padding: '10px 12px' },
  mark: { flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 999, border: '2px solid', fontSize: 20, fontWeight: 700 },
  title: { display: 'block', fontSize: 15 },
  sub: { display: 'block', fontSize: 12, color: 'var(--al-text)', marginTop: 2 },
  note: { display: 'block', fontSize: 11, color: 'var(--al-muted)', marginTop: 2 },
  code: { fontFamily: mono, fontSize: 12 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 },
  event: { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, padding: '3px 6px', borderRadius: 6 },
  brokenEvent: { outline: '1.5px solid var(--al-block)' },
  seq: { fontFamily: mono, color: 'var(--al-muted)', minWidth: 34 },
  type: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  time: { fontFamily: mono, fontSize: 11, color: 'var(--al-muted)', whiteSpace: 'nowrap' },
  hash: { fontFamily: mono, fontSize: 11, color: 'var(--al-muted)' },
  brokenTag: { fontSize: 11, color: 'var(--al-block)', fontWeight: 600, whiteSpace: 'nowrap' },
} satisfies Record<string, CSSProperties>;

// --- Widget definition ----------------------------------------------------------------------------

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="9" width="7" height="6" rx="3"/><rect x="14" y="9" width="7" height="6" rx="3"/><path d="M10 12h4"/></svg>';

const column = (aiDescription: string, roles: ('category' | 'numeric')[] = ['category']): AgDataMappingDefinition<Slot> => ({
  type: 'field',
  supportedRoles: roles,
  requires: { cardinality: 'many' },
  required: true,
  aiDescription,
});

export const chainSealDefinition: ChainSealDefinition = {
  id: 'chain-seal',
  label: 'Chain Seal',
  icon: ICON,
  dataMapping: {
    seq: column('Event sequence number, 1..n (chain_events.seq), not aggregated.', ['category', 'numeric']),
    at: column('Event time as the exact stored text (chain_events.at). A reformatted date breaks the hashes.'),
    type: column('Event type (chain_events.type).'),
    payload: column('Canonical JSON payload, exact text (chain_events.payload).'),
    prevHash: column('Hash of the previous event (chain_events.prevHash).'),
    hash: column('This event’s SHA-256 hash (chain_events.hash).'),
  },
  form: (params) => {
    const form = params.createDefaults({
      dataMappingItems: [
        { key: 'seq', label: 'Sequence' },
        { key: 'at', label: 'Time (exact text)' },
        { key: 'type', label: 'Event type' },
        { key: 'payload', label: 'Payload (canonical JSON)' },
        { key: 'prevHash', label: 'Previous hash' },
        { key: 'hash', label: 'Hash' },
      ],
    });
    form.items[0]?.items.push({
      type: 'section',
      key: 'chainSeal',
      label: 'Seal',
      items: [
        { type: 'number', id: 'format.style.showLast', label: 'Show last N events', defaultValue: DEFAULTS.showLast, min: 1, max: 50, step: 1 },
        { type: 'checkbox', id: 'format.style.showHashes', label: 'Show short hashes', defaultValue: DEFAULTS.showHashes },
      ],
    });
    return form;
  },
  comp: ChainSeal,
  defaultSize: { width: 360, height: 300 },
  minSize: { width: 240, height: 160 },
  ai: {
    label: 'Chain Seal',
    description: 'Verifies the hash-chained audit log in the browser (SHA-256 via WebCrypto) and shows "Chain verified" or where it is broken, with the latest events.',
    usage: 'Use on audit or incident pages as tamper evidence. Needs the whole chain_events table, unfiltered.',
    configuration: 'Bind each slot to the chain_events field of the same name (seq, at, type, payload, prevHash, hash), none aggregated.',
  },
};
