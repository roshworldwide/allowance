'use client';

// Allowance Ring: a custom AG Studio widget showing one allowance as a ring - committed (spent) and
// reserved (held for step-ups) against the budget, with what is left and the days remaining in the
// middle. Every value comes from fields the analyst binds in Studio's edit panel (Setup tab), so the
// same widget works on any table with budget-like columns; the defaults bind it to `mandates`.
//
// Colour is never the only signal: each segment has a text label and an amount in the legend, the
// ring has a full text description for screen readers, and the warning carries words, not just amber.

import { use, useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { AgDataMappingDefinition, AgWidgetField, AgWidgetParams } from 'ag-studio';
import { AgIncompleteDataMappingOverlay, AgNoDataOverlay } from 'ag-studio-react';
import type { AllowanceRingDefinition, AllowanceRingWidget, RingCenterMetric } from '../registry';

const DEFAULTS = { centerMetric: 'remaining' as RingCenterMetric, warnAtPct: 80, showDaysLeft: true, animate: true };

// --- Reduced motion ---------------------------------------------------------------------------------

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

// --- Geometry -------------------------------------------------------------------------------------

const SIZE = 120;
const RADIUS = 50;
const STROKE = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

const toNumber = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function AllowanceRing({ widgetApi, dataMapping, format }: AgWidgetParams<AllowanceRingWidget>) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
  const style = { ...DEFAULTS, ...format?.style };
  const animate = style.animate && !reducedMotion;
  // Arcs start empty and sweep to their length on the first frame after mount.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const budgetField = dataMapping.budget?.[0];
  const committedField = dataMapping.committed?.[0];
  if (!budgetField || !committedField) return <AgIncompleteDataMappingOverlay />;

  const reservedField = dataMapping.reserved?.[0];
  const daysField = dataMapping.daysLeft?.[0];
  const labelField = dataMapping.label?.[0];
  const fields = [budgetField, committedField, reservedField, daysField, labelField].filter((f): f is AgWidgetField => f !== undefined);

  return (
    <RingBody
      // getData returns the same promise for an equal query, which is what `use` needs.
      response={use(widgetApi.getData({ fields }))}
      widgetApi={widgetApi}
      budgetField={budgetField}
      committedField={committedField}
      reservedField={reservedField}
      daysField={daysField}
      labelField={labelField}
      centerMetric={style.centerMetric}
      warnAtPct={style.warnAtPct}
      showDaysLeft={style.showDaysLeft}
      animate={animate}
      drawn={drawn || !animate}
    />
  );
}

type RingBodyProps = {
  response: Awaited<ReturnType<AgWidgetParams['widgetApi']['getData']>>;
  widgetApi: AgWidgetParams['widgetApi'];
  budgetField: AgWidgetField;
  committedField: AgWidgetField;
  reservedField?: AgWidgetField;
  daysField?: AgWidgetField;
  labelField?: AgWidgetField;
  centerMetric: RingCenterMetric;
  warnAtPct: number;
  showDaysLeft: boolean;
  animate: boolean;
  drawn: boolean;
};

function RingBody(props: RingBodyProps) {
  const { response, widgetApi, budgetField, committedField, reservedField, daysField, labelField } = props;
  const row = response.results.rows[0];
  if (!row) return <AgNoDataOverlay />;

  const budget = toNumber(row[budgetField.key]);
  const committed = toNumber(row[committedField.key]);
  const reserved = reservedField ? toNumber(row[reservedField.key]) : 0;
  const daysLeft = daysField && row[daysField.key] != null ? Math.max(0, Math.round(toNumber(row[daysField.key]))) : undefined;
  const label = labelField && row[labelField.key] != null ? String(row[labelField.key]) : '';
  if (!(budget > 0)) return <AgNoDataOverlay />;

  const remaining = Math.max(0, budget - committed - reserved);
  const usedPct = ((committed + reserved) / budget) * 100;
  const committedFrac = clamp01(committed / budget);
  const reservedFrac = Math.min(clamp01(reserved / budget), 1 - committedFrac);
  // Amounts use the budget field's own format (currency, locale), as the rest of Studio does.
  const money = (value: number) => widgetApi.formatFieldValue(budgetField, value);
  const pct = (value: number) => `${Math.round(value)}%`;
  const warn = usedPct >= props.warnAtPct;

  const center =
    props.centerMetric === 'committed'
      ? { value: money(committed), caption: `spent of ${money(budget)}` }
      : props.centerMetric === 'percentUsed'
        ? { value: pct(usedPct), caption: `used of ${money(budget)}` }
        : { value: money(remaining), caption: `left of ${money(budget)}` };
  const days = props.showDaysLeft && daysLeft !== undefined ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : '';

  const description =
    `${label ? `${label}: ` : ''}${money(committed)} committed, ${money(reserved)} reserved and ${money(remaining)} remaining ` +
    `of a ${money(budget)} budget (${pct(usedPct)} used)${days ? `, ${days}` : ''}.`;

  const committedLen = props.drawn ? committedFrac * CIRCUMFERENCE : 0;
  const reservedLen = props.drawn ? reservedFrac * CIRCUMFERENCE : 0;
  const transition = props.animate ? 'stroke-dasharray 900ms cubic-bezier(0.2, 0.7, 0.2, 1), stroke-dashoffset 900ms cubic-bezier(0.2, 0.7, 0.2, 1)' : 'none';

  return (
    <div style={styles.root}>
      <div style={styles.ringBox}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={description} style={styles.svg}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} fill="none" strokeWidth={STROKE}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke="var(--al-line)" />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke="var(--al-allow)"
              strokeLinecap="butt"
              strokeDasharray={`${committedLen} ${CIRCUMFERENCE}`}
              style={{ transition }}
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke="var(--al-stepup)"
              strokeLinecap="butt"
              strokeDasharray={`${reservedLen} ${CIRCUMFERENCE}`}
              strokeDashoffset={-committedLen}
              style={{ transition }}
            />
          </g>
        </svg>
        <div style={styles.center} aria-hidden>
          <span style={styles.centerValue}>{center.value}</span>
          <span style={styles.centerCaption}>{center.caption}</span>
          {days && <span style={styles.centerDays}>{days}</span>}
        </div>
      </div>

      <div style={styles.legend}>
        {label && <p style={styles.label}>{label}</p>}
        <dl style={styles.list}>
          <LegendRow swatch={<Swatch color="var(--al-allow)" />} name="Committed" detail="paid" amount={money(committed)} share={pct(committedFrac * 100)} />
          <LegendRow swatch={<Swatch color="var(--al-stepup)" />} name="Reserved" detail="awaiting approval" amount={money(reserved)} share={pct(reservedFrac * 100)} />
          <LegendRow swatch={<Swatch hollow />} name="Remaining" detail="" amount={money(remaining)} share={pct(clamp01(remaining / budget) * 100)} />
        </dl>
        {warn && (
          <p style={styles.warning} role="status">
            <span aria-hidden style={styles.warningMark}>
              !
            </span>
            {pct(usedPct)} of the budget is used or held
          </p>
        )}
      </div>
    </div>
  );
}

function LegendRow({ swatch, name, detail, amount, share }: { swatch: React.ReactNode; name: string; detail: string; amount: string; share: string }) {
  return (
    <div style={styles.legendRow}>
      <dt style={styles.legendName}>
        {swatch}
        <span>
          {name}
          {detail && <span style={styles.legendDetail}> · {detail}</span>}
        </span>
      </dt>
      <dd style={styles.legendValue}>
        {amount} <span style={styles.legendShare}>{share}</span>
      </dd>
    </div>
  );
}

function Swatch({ color, hollow }: { color?: string; hollow?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        ...styles.swatch,
        background: hollow ? 'transparent' : color,
        boxShadow: hollow ? 'inset 0 0 0 2px var(--al-line)' : undefined,
      }}
    />
  );
}

const mono = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace';

const styles = {
  root: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100%', width: '100%', padding: '4px 8px', color: 'var(--al-text)', overflow: 'hidden' },
  ringBox: { position: 'relative', height: 'min(100%, 220px)', aspectRatio: '1 / 1', minHeight: 120, flex: '0 0 auto' },
  svg: { display: 'block', width: '100%', height: '100%' },
  center: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 18%' },
  centerValue: { fontFamily: mono, fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 'clamp(14px, 1.6vw, 22px)', lineHeight: 1.1 },
  centerCaption: { fontSize: 11, color: 'var(--al-muted)', marginTop: 2 },
  centerDays: { fontSize: 11, color: 'var(--al-text)', marginTop: 6, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--al-line)' },
  legend: { flex: '1 1 150px', minWidth: 150, maxWidth: 280 },
  label: { margin: '0 0 8px', fontSize: 13, fontWeight: 600 },
  list: { margin: 0, display: 'grid', gap: 6 },
  legendRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 12 },
  legendName: { display: 'flex', alignItems: 'center', gap: 6, margin: 0 },
  legendDetail: { color: 'var(--al-muted)' },
  legendValue: { margin: 0, fontFamily: mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  legendShare: { color: 'var(--al-muted)', marginLeft: 4 },
  swatch: { display: 'inline-block', width: 10, height: 10, borderRadius: 999, flex: '0 0 auto' },
  warning: { margin: '10px 0 0', fontSize: 12, color: 'var(--al-stepup)', display: 'flex', alignItems: 'center', gap: 6 },
  warningMark: { display: 'inline-grid', placeItems: 'center', width: 16, height: 16, borderRadius: 999, border: '1.5px solid currentColor', fontSize: 11, fontWeight: 700 },
} satisfies Record<string, CSSProperties>;

// --- Widget definition (registered through ../widgets.ts) -------------------------------------------

// A string icon is parsed as HTML by Studio; this one is ours, so it is trusted. currentColor follows
// Studio's icon colour in light and dark themes.
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="8" opacity="0.35"/><path d="M12 4a8 8 0 0 1 7.2 11.5"/><path d="M19.2 15.5A8 8 0 0 1 14 19.7" opacity="0.7"/></svg>';

const numeric = (aiDescription: string, required = false): AgDataMappingDefinition<keyof AllowanceRingWidget['dataMapping']> => ({
  type: 'field',
  supportedRoles: ['numeric'],
  requires: { cardinality: 'one' },
  required,
  aiDescription,
});

export const allowanceRingDefinition: AllowanceRingDefinition = {
  id: 'allowance-ring',
  label: 'Allowance Ring',
  icon: ICON,
  dataMapping: {
    budget: numeric('Total budget of the allowance, e.g. mandates.budgetUsd.', true),
    committed: numeric('Money already paid against the allowance, e.g. mandates.committedUsd.', true),
    reserved: numeric('Money held for purchases awaiting approval, e.g. mandates.reservedUsd.'),
    daysLeft: numeric('Days left in the allowance period, e.g. mandates.daysLeft with min aggregation.'),
    label: {
      type: 'field',
      supportedRoles: ['category'],
      requires: { cardinality: 'many' },
      required: false,
      aiDescription: 'Allowance name, e.g. mandates.name. The ring shows the first allowance returned, so filter to one.',
    },
  },
  form: (params) => {
    const form = params.createDefaults({
      dataMappingItems: [
        { key: 'budget', label: 'Budget' },
        { key: 'committed', label: 'Committed (paid)' },
        { key: 'reserved', label: 'Reserved (awaiting approval)' },
        { key: 'daysLeft', label: 'Days left' },
        { key: 'label', label: 'Allowance name' },
      ],
    });
    // createDefaults returns Setup and Format tabs; the ring's own options go on Setup.
    form.items[0]?.items.push({
      type: 'section',
      key: 'allowanceRing',
      label: 'Ring',
      items: [
        {
          type: 'select',
          id: 'format.style.centerMetric',
          label: 'Centre shows',
          defaultValue: DEFAULTS.centerMetric,
          items: [
            { label: 'Remaining', value: 'remaining' },
            { label: 'Committed', value: 'committed' },
            { label: 'Percent used', value: 'percentUsed' },
          ],
        },
        { type: 'number', id: 'format.style.warnAtPct', label: 'Warn at % used', defaultValue: DEFAULTS.warnAtPct, min: 1, max: 100, step: 5 },
        { type: 'checkbox', id: 'format.style.showDaysLeft', label: 'Show days left', defaultValue: DEFAULTS.showDaysLeft },
        { type: 'toggle', id: 'format.style.animate', label: 'Animate (off with reduced motion)', defaultValue: DEFAULTS.animate },
      ],
    });
    return form;
  },
  comp: AllowanceRing,
  defaultSize: { width: 380, height: 260 },
  minSize: { width: 240, height: 180 },
  ai: {
    label: 'Allowance Ring',
    description: 'Ring showing how much of a spending allowance is committed (paid) and reserved (awaiting approval), with the remaining amount and days left in the centre.',
    usage: 'Use for one allowance (mandate) at a time, at the top of a page. Not for comparing many allowances: use a bar chart for that.',
    configuration: 'Bind budget, committed and reserved to mandates.budgetUsd, mandates.committedUsd and mandates.reservedUsd (sum), daysLeft to mandates.daysLeft (min), and label to mandates.name.',
  },
};
