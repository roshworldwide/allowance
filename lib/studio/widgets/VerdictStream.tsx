'use client';

// Verdict Stream: a custom AG Studio widget listing decisions newest first - verdict, the rule that
// stopped it, amount, merchant, item, what happened next, and whether PayPal confirmed it. Fields are
// bound in Studio's edit panel (Setup tab), so it also works on a replay or Attack Lab table.
//
// Clicking a row drills the whole report through to that decision (Studio's `drillThrough`
// property): every widget, on every page, then shows only that decision - including the rule trace
// grid. ControlRoom owns the drill state (via the `context` property) so its header can clear it;
// without that context the widget sets the property itself.
// Docs: https://www.ag-grid.com/studio/archive/3.1.0/react/drill-through/

import { use, type CSSProperties } from 'react';
import type { AgDataMappingDefinition, AgFilter, AgWidgetField, AgWidgetParams } from 'ag-studio';
import { AgIncompleteDataMappingOverlay, AgNoDataOverlay } from 'ag-studio-react';
import type { ControlRoomContext, VerdictStreamDefinition, VerdictStreamWidget } from '../registry';
import { ConfirmedTick, RuleChip, StatusChip, VERDICT_META, VerdictChip, isStatus, isVerdict } from './chips';

const DEFAULTS = { maxRows: 12, onlyAlerts: false, showConfirmed: true, clickToDrill: true };
const MAX_ROWS = 200;

type Slot = keyof VerdictStreamWidget['dataMapping'];

export function VerdictStream({ widgetApi, dataMapping, format, api, context }: AgWidgetParams<VerdictStreamWidget>) {
  const style = { ...DEFAULTS, ...format?.style };
  const field = (slot: Slot) => dataMapping[slot]?.[0];
  const idField = field('id');
  const atField = field('at');
  const verdictField = field('verdict');
  if (!idField || !atField || !verdictField) return <AgIncompleteDataMappingOverlay />;

  const optional = {
    firstBlock: field('firstBlock'),
    firstBlockName: field('firstBlockName'),
    amount: field('amount'),
    merchant: field('merchant'),
    item: field('item'),
    status: field('status'),
    confirmed: field('confirmed'),
  };
  const fields = [idField, atField, verdictField, ...Object.values(optional)].filter((f): f is AgWidgetField => f !== undefined);
  const filter: AgFilter[] = style.onlyAlerts ? [{ field: verdictField, operator: 'isIn', value: ['BLOCK', 'STEP_UP'] }] : [];
  const rowCount = Math.min(MAX_ROWS, Math.max(1, Math.round(style.maxRows || DEFAULTS.maxRows)));

  // getData returns the same promise for an equal query, which is what `use` needs.
  const response = use(widgetApi.getData({ fields, filter, sort: [{ field: atField, direction: 'desc' }], limit: { count: rowCount } }));
  const rows = response.results.rows;

  // The decision the report is drilled through to, if it is one of ours.
  const drill = api.getProperty('drillThrough')?.filter;
  const selectedId = drill && !('conditions' in drill) && drill.field.id === idField.fieldId ? String(drill.value) : undefined;
  const ctx = context as ControlRoomContext | undefined;
  const drillTo = (id: string | null) => {
    const target = id === null ? null : { id, fieldId: idField.fieldId };
    if (ctx?.drillToDecision) ctx.drillToDecision(target);
    else api.setProperty('drillThrough', target ? { filter: { field: { id: target.fieldId }, operator: 'equals', value: target.id } } : undefined);
  };

  if (rows.length === 0) return <AgNoDataOverlay />;

  const text = (f: AgWidgetField | undefined, row: Record<string, unknown>) => (f && row[f.key] != null ? String(row[f.key]) : '');
  const formatted = (f: AgWidgetField | undefined, row: Record<string, unknown>) => (f && row[f.key] != null ? widgetApi.formatFieldValue(f, row[f.key]) : '');

  return (
    <div style={s.root}>
      {selectedId && (
        <p style={s.banner} role="status">
          <span>
            Drilled through to <code style={s.code}>{selectedId}</code>: the whole report shows only this decision.
          </span>
          <button type="button" style={s.clear} onClick={() => drillTo(null)}>
            Show all
          </button>
        </p>
      )}
      <ol style={s.list} aria-label="Decisions, newest first">
        {rows.map((row) => {
          const id = text(idField, row);
          const verdict = row[verdictField.key];
          const status = optional.status ? row[optional.status.key] : undefined;
          const ruleId = text(optional.firstBlock, row);
          const item = text(optional.item, row);
          const merchant = text(optional.merchant, row);
          const amount = formatted(optional.amount, row);
          const confirmed = optional.confirmed && style.showConfirmed ? row[optional.confirmed.key] === true : false;
          const selected = id === selectedId;
          const body = (
            <>
              <span style={s.line}>
                {isVerdict(verdict) ? <VerdictChip verdict={verdict} /> : <span>{String(verdict ?? '')}</span>}
                <span style={s.item}>{item || id}</span>
                {amount && <span style={s.amount}>{amount}</span>}
              </span>
              <span style={{ ...s.line, ...s.meta }}>
                {ruleId && <RuleChip ruleId={ruleId} name={text(optional.firstBlockName, row)} />}
                {merchant && <span>{merchant}</span>}
                {isStatus(status) && <StatusChip status={status} />}
                {confirmed && <ConfirmedTick />}
                <span style={s.time}>{formatted(atField, row)}</span>
              </span>
            </>
          );
          const accent = isVerdict(verdict) ? VERDICT_META[verdict].color : 'var(--al-line)';
          return (
            <li key={id} style={{ ...s.row, borderLeftColor: accent, ...(selected ? s.selected : {}) }} aria-current={selected || undefined}>
              {style.clickToDrill ? (
                <button type="button" style={s.button} onClick={() => drillTo(selected ? null : id)} aria-label={`${String(verdict)} ${item || id} ${amount}. ${selected ? 'Show all decisions' : 'Show only this decision and its rule trace'}`}>
                  {body}
                </button>
              ) : (
                <div style={s.button}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const mono = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace';

const s = {
  root: { height: '100%', width: '100%', overflowY: 'auto', color: 'var(--al-text)', padding: '2px 2px 4px' },
  banner: { margin: '0 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--al-accent)', fontSize: 12 },
  code: { fontFamily: mono, fontSize: 11 },
  clear: { border: '1px solid var(--al-line)', borderRadius: 6, padding: '2px 8px', color: 'var(--al-accent)', background: 'transparent', cursor: 'pointer', fontSize: 12 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 },
  row: { borderLeft: '3px solid', borderRadius: 8, background: 'var(--al-slate-2)' },
  selected: { outline: '1.5px solid var(--al-accent)' },
  button: { display: 'grid', gap: 3, width: '100%', textAlign: 'left', padding: '6px 10px', background: 'transparent', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', borderRadius: 8 },
  line: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  item: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500 },
  amount: { fontFamily: mono, fontVariantNumeric: 'tabular-nums', fontSize: 13, whiteSpace: 'nowrap' },
  meta: { flexWrap: 'wrap', fontSize: 11, color: 'var(--al-muted)', columnGap: 10, rowGap: 2 },
  time: { marginLeft: 'auto', fontFamily: mono, whiteSpace: 'nowrap' },
} satisfies Record<string, CSSProperties>;

// --- Widget definition ----------------------------------------------------------------------------

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<path d="M4 6h3M4 12h3M4 18h3"/><path d="M10 6h10M10 12h7M10 18h9" opacity="0.6"/></svg>';

type MappingDef = AgDataMappingDefinition<Slot>;
const category = (aiDescription: string, required = false): MappingDef => ({ type: 'field', supportedRoles: ['category'], requires: { cardinality: 'many' }, required, aiDescription });

export const verdictStreamDefinition: VerdictStreamDefinition = {
  id: 'verdict-stream',
  label: 'Verdict Stream',
  icon: ICON,
  dataMapping: {
    id: category('Decision id (decisions.id). One row per value.', true),
    at: { type: 'field', supportedRoles: ['temporal', 'category'], requires: { cardinality: 'many' }, required: true, aiDescription: 'When the guard decided (decisions.at); rows are newest first.' },
    verdict: category('ALLOW, STEP_UP or BLOCK (decisions.verdict).', true),
    firstBlock: category('Rule id that blocked it, e.g. R02 (decisions.firstBlock).'),
    firstBlockName: category('Name of that rule, e.g. TASK_BINDING (decisions.firstBlockName).'),
    amount: { type: 'field', supportedRoles: ['numeric'], requires: { cardinality: 'one', per: 'dataMapping.id' }, required: false, aiDescription: 'Amount in USD (decisions.amountUsd, sum).' },
    merchant: category('Merchant name (decisions.merchantName).'),
    item: category('Item name (decisions.itemName).'),
    status: category('What happened after the verdict (decisions.status).'),
    confirmed: category('Whether PayPal confirmed the payment (decisions.paypalConfirmed).'),
  },
  form: (params) => {
    const form = params.createDefaults({
      dataMappingItems: [
        { key: 'id', label: 'Decision id' },
        { key: 'at', label: 'Decided at' },
        { key: 'verdict', label: 'Verdict' },
        { key: 'firstBlock', label: 'First block (rule id)' },
        { key: 'firstBlockName', label: 'First block (rule name)' },
        { key: 'amount', label: 'Amount' },
        { key: 'merchant', label: 'Merchant' },
        { key: 'item', label: 'Item' },
        { key: 'status', label: 'Status' },
        { key: 'confirmed', label: 'PayPal confirmed' },
      ],
    });
    form.items[0]?.items.push({
      type: 'section',
      key: 'verdictStream',
      label: 'Stream',
      items: [
        { type: 'number', id: 'format.style.maxRows', label: 'Max rows', defaultValue: DEFAULTS.maxRows, min: 1, max: MAX_ROWS, step: 1 },
        { type: 'checkbox', id: 'format.style.onlyAlerts', label: 'Show only BLOCK and STEP_UP', defaultValue: DEFAULTS.onlyAlerts },
        { type: 'checkbox', id: 'format.style.showConfirmed', label: 'Show "PayPal confirmed"', defaultValue: DEFAULTS.showConfirmed },
        { type: 'toggle', id: 'format.style.clickToDrill', label: 'Click a row to drill through', defaultValue: DEFAULTS.clickToDrill },
      ],
    });
    return form;
  },
  comp: VerdictStream,
  defaultSize: { width: 520, height: 420 },
  minSize: { width: 300, height: 200 },
  ai: {
    label: 'Verdict Stream',
    description: 'Live list of guard decisions, newest first: verdict chip, the rule that blocked it, amount, merchant, item, status and PayPal confirmation.',
    usage: 'Use to show recent activity or incidents. Clicking a row drills the report through to that decision.',
    configuration: 'Bind id, at and verdict to decisions.id, decisions.at and decisions.verdict; the other slots to the decisions field of the same name (amount = decisions.amountUsd sum).',
  },
};
