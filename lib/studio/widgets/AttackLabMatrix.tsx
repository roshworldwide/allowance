'use client';

// Attack Lab Matrix: a custom AG Studio widget showing the attack success rate (ASR) per attack
// family (rows) with and without the guard (columns). Each cell shows the percentage and the k/n
// count as text, on a scale from mint (0%) to coral (every run succeeded). Held-out families, which
// the guard was never tuned on, get their own section. ASR is computed as sum(successes) / sum(runs)
// from the bound fields, so it stays correct when rows are filtered or grouped.

import { use, type CSSProperties } from 'react';
import type { AgDataMappingDefinition, AgWidgetField, AgWidgetParams } from 'ag-studio';
import { AgIncompleteDataMappingOverlay } from 'ag-studio-react';
import type { AttackLabMatrixDefinition, AttackLabMatrixWidget } from '../registry';

const DEFAULTS = { showCounts: true, decimals: 0, sortBy: 'unguardedAsr' as 'name' | 'unguardedAsr' };

type Cell = { k: number; n: number };
type Family = { name: string; holdout: boolean; cells: Map<string, Cell> };

const toNumber = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
// Unguarded first: the baseline the guard is measured against.
const configRank = (c: string) => (c.toLowerCase() === 'unguarded' ? 0 : c.toLowerCase() === 'guarded' ? 1 : 2);

export function AttackLabMatrix({ widgetApi, dataMapping, format }: AgWidgetParams<AttackLabMatrixWidget>) {
  const style = { ...DEFAULTS, ...format?.style };
  const familyField = dataMapping.family?.[0];
  const configField = dataMapping.config?.[0];
  const successField = dataMapping.successes?.[0];
  const runsField = dataMapping.runs?.[0];
  const holdoutField = dataMapping.holdout?.[0];
  if (!familyField || !configField || !successField || !runsField) return <AgIncompleteDataMappingOverlay />;

  const fields = [familyField, configField, successField, runsField, holdoutField].filter((f): f is AgWidgetField => f !== undefined);
  const rows = use(widgetApi.getData({ fields })).results.rows;
  if (rows.length === 0) {
    return (
      <div style={s.empty} role="status">
        <p style={s.emptyTitle}>No Attack Lab run yet</p>
        <p style={s.emptyHint}>Run the Attack Lab to measure how often attacks get money out with and without ALLOWANCE.</p>
      </div>
    );
  }

  const families = new Map<string, Family>();
  const configs = new Set<string>();
  for (const row of rows) {
    const name = String(row[familyField.key] ?? '');
    const config = String(row[configField.key] ?? '');
    const holdout = holdoutField ? row[holdoutField.key] === true || row[holdoutField.key] === 'true' : false;
    const key = `${holdout ? 'h' : 'm'}:${name}`;
    const fam = families.get(key) ?? { name, holdout, cells: new Map<string, Cell>() };
    const prev = fam.cells.get(config) ?? { k: 0, n: 0 };
    fam.cells.set(config, { k: prev.k + toNumber(row[successField.key]), n: prev.n + toNumber(row[runsField.key]) });
    families.set(key, fam);
    configs.add(config);
  }
  const columns = [...configs].sort((a, b) => configRank(a) - configRank(b) || a.localeCompare(b));
  const rate = (c?: Cell) => (c && c.n > 0 ? c.k / c.n : undefined);
  const sorted = [...families.values()].sort((a, b) =>
    style.sortBy === 'name' ? a.name.localeCompare(b.name) : (rate(b.cells.get(columns[0] ?? '')) ?? -1) - (rate(a.cells.get(columns[0] ?? '')) ?? -1) || a.name.localeCompare(b.name),
  );
  const main = sorted.filter((f) => !f.holdout);
  const holdout = sorted.filter((f) => f.holdout);
  const decimals = Math.min(2, Math.max(0, Math.round(style.decimals)));
  const label = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

  const renderRow = (f: Family) => (
    <tr key={`${f.holdout}:${f.name}`}>
      <th scope="row" style={s.family}>
        {f.name}
      </th>
      {columns.map((c) => {
        const cell = f.cells.get(c);
        const r = rate(cell);
        if (r === undefined || !cell) {
          return (
            <td key={c} style={{ ...s.cell, ...s.na }}>
              not run
            </td>
          );
        }
        const pct = `${(r * 100).toFixed(decimals)}%`;
        // Mint at 0% → coral at 100%, mixed in OKLab (a straight line, so the middle never reads as the
        // amber used for STEP_UP); the tint keeps text readable on the dark card.
        const tone = `color-mix(in oklab, var(--al-block) ${Math.round(r * 100)}%, var(--al-allow))`;
        return (
          <td
            key={c}
            aria-label={`${label(c)}: ${pct}, ${cell.k} of ${cell.n} runs moved money`}
            style={{ ...s.cell, background: `color-mix(in srgb, ${tone} 34%, transparent)`, boxShadow: `inset 3px 0 0 ${tone}` }}
          >
            <span style={s.pct}>{pct}</span>
            {style.showCounts && (
              <span style={s.count}>
                {cell.k}/{cell.n}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div style={s.root}>
      <table style={s.table}>
        <caption style={s.caption}>Attack success rate: share of agent runs in which the attack moved money</caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...s.head, textAlign: 'left' }}>
              Attack family
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" style={s.head}>
                {label(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{main.map(renderRow)}</tbody>
        {holdout.length > 0 && (
          <tbody>
            <tr>
              <th scope="rowgroup" colSpan={columns.length + 1} style={s.section}>
                Holdout · written independently, never tuned on
              </th>
            </tr>
            {holdout.map(renderRow)}
          </tbody>
        )}
      </table>
    </div>
  );
}

const mono = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace';

const s = {
  root: { height: '100%', width: '100%', overflow: 'auto', color: 'var(--al-text)' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px', fontSize: 12 },
  caption: { captionSide: 'top', textAlign: 'left', color: 'var(--al-muted)', fontSize: 11, padding: '0 0 4px' },
  head: { color: 'var(--al-muted)', fontWeight: 600, fontSize: 11, textAlign: 'center', padding: '2px 6px' },
  family: { textAlign: 'left', fontWeight: 500, padding: '4px 8px 4px 0', maxWidth: 240 },
  cell: { textAlign: 'center', padding: '4px 8px', borderRadius: 6, minWidth: 84 },
  na: { color: 'var(--al-muted)', fontSize: 11, border: '1px dashed var(--al-line)' },
  pct: { display: 'block', fontFamily: mono, fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 13 },
  count: { display: 'block', fontFamily: mono, fontVariantNumeric: 'tabular-nums', fontSize: 10, color: 'var(--al-muted)' },
  section: { textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--al-accent)', padding: '8px 0 2px', borderTop: '1px solid var(--al-line)' },
  empty: { height: '100%', display: 'grid', placeContent: 'center', textAlign: 'center', gap: 6, padding: 16 },
  emptyTitle: { margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--al-text)' },
  emptyHint: { margin: 0, fontSize: 12, color: 'var(--al-muted)', maxWidth: 320 },
} satisfies Record<string, CSSProperties>;

// --- Widget definition ----------------------------------------------------------------------------

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
  '<rect x="3" y="4" width="8" height="4" rx="1"/><rect x="13" y="4" width="8" height="4" rx="1" opacity="0.4"/>' +
  '<rect x="3" y="10" width="8" height="4" rx="1" opacity="0.7"/><rect x="13" y="10" width="8" height="4" rx="1" opacity="0.4"/>' +
  '<rect x="3" y="16" width="8" height="4" rx="1" opacity="0.55"/><rect x="13" y="16" width="8" height="4" rx="1" opacity="0.4"/></svg>';

type MappingDef = AgDataMappingDefinition<keyof AttackLabMatrixWidget['dataMapping']>;
const measure = (aiDescription: string): MappingDef => ({ type: 'field', supportedRoles: ['numeric'], requires: { cardinality: 'one' }, required: true, aiDescription });

export const attackLabMatrixDefinition: AttackLabMatrixDefinition = {
  id: 'attack-lab-matrix',
  label: 'Attack Lab Matrix',
  icon: ICON,
  dataMapping: {
    family: { type: 'field', supportedRoles: ['category'], requires: { cardinality: 'many' }, required: true, aiDescription: 'Attack family name, one matrix row each (lab_results.familyName).' },
    config: { type: 'field', supportedRoles: ['category'], requires: { cardinality: 'many' }, required: true, aiDescription: 'unguarded or guarded, one column each (lab_results.config).' },
    successes: measure('Runs in which the attack moved money (lab_results.successes, sum).'),
    runs: measure('Total agent runs (lab_results.runs, sum).'),
    holdout: { type: 'field', supportedRoles: ['category'], requires: { cardinality: 'many' }, required: false, aiDescription: 'True for held-out families, shown in their own section (lab_results.holdout).' },
  },
  form: (params) => {
    const form = params.createDefaults({
      dataMappingItems: [
        { key: 'family', label: 'Attack family (rows)' },
        { key: 'config', label: 'Configuration (columns)' },
        { key: 'successes', label: 'Successful attacks' },
        { key: 'runs', label: 'Runs' },
        { key: 'holdout', label: 'Holdout flag' },
      ],
    });
    form.items[0]?.items.push({
      type: 'section',
      key: 'attackLabMatrix',
      label: 'Matrix',
      items: [
        { type: 'checkbox', id: 'format.style.showCounts', label: 'Show k/n counts', defaultValue: DEFAULTS.showCounts },
        { type: 'number', id: 'format.style.decimals', label: 'Decimal places', defaultValue: DEFAULTS.decimals, min: 0, max: 2, step: 1 },
        {
          type: 'select',
          id: 'format.style.sortBy',
          label: 'Sort rows by',
          defaultValue: DEFAULTS.sortBy,
          items: [
            { label: 'Unguarded success rate', value: 'unguardedAsr' },
            { label: 'Family name', value: 'name' },
          ],
        },
      ],
    });
    return form;
  },
  comp: AttackLabMatrix,
  defaultSize: { width: 520, height: 380 },
  minSize: { width: 300, height: 200 },
  ai: {
    label: 'Attack Lab Matrix',
    description: 'Heatmap of attack success rate per attack family, unguarded vs guarded, with k/n counts; held-out families in their own section.',
    usage: 'Use on Attack Lab pages to show how much the guard reduces attack success.',
    configuration: 'Bind family to lab_results.familyName, config to lab_results.config, successes and runs to lab_results.successes / lab_results.runs (sum), holdout to lab_results.holdout.',
  },
};
