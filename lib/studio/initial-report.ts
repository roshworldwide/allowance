// The Control Room's default report: four pages (Overview, Incidents, Attack Lab, PayPal). Field ids
// ('decisions.verdict') refer to ./datasources.ts. Layout is Studio's 24-column canvas grid
// (xTrack/yTrack/xSpan/ySpan, rows of studioCanvasRowHeight). Studio has no page switcher of its
// own: ControlRoom's header renders tabs from PAGE_TITLES and sets `selectedPageId`.

import type { AgFilterState, AgPageState, AgReportState, AgWidgetLayoutState } from 'ag-studio';
import type { ControlRoomRegistry } from './registry';

type Page = AgPageState<ControlRoomRegistry>;
type FilterState = AgFilterState<ControlRoomRegistry>;

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string, subtitle?: string) => ({
  title: { enabled: true, text },
  ...(subtitle && { subtitle: { enabled: true, text: subtitle } }),
});
const countd = (id: string) => ({ id, aggregation: 'countd' as const });
const sum = (id: string) => ({ id, aggregation: 'sum' as const });
const legend = { theme: { common: { legend: { enabled: true } } } };

const kpi = (text: string, value: { id: string; aggregation: 'sum' | 'countd' }, color?: string, caption?: string) => ({
  type: 'value' as const,
  dataMapping: { value: [value] },
  format: {
    ...title(text),
    ...(caption && { caption: { enabled: true, text: caption } }),
    style: color ? { color } : {},
  },
});

const note = (text: string) => ({
  type: 'text' as const,
  dataMapping: {},
  format: { style: { text, color: 'var(--al-muted)', typography: { fontSize: 13 }, verticalAlign: 'top' as const, padding: true } },
});

const isIn = (id: string, ...value: string[]): FilterState => ({ field: { id }, model: { operator: 'isIn', value } });
const notBlank = (id: string): FilterState => ({ field: { id }, model: { operator: 'isNotBlank' } });
const isTrue = (id: string): FilterState => ({ field: { id }, model: { operator: 'isTrue' } });

/** The decision stream as on Overview; `onlyAlerts` narrows it to BLOCK and STEP_UP. */
const verdictStream = (onlyAlerts: boolean, maxRows: number) => ({
  type: 'verdict-stream' as const,
  dataMapping: {
    id: [{ id: 'decisions.id' }],
    at: [{ id: 'decisions.at' }],
    verdict: [{ id: 'decisions.verdict' }],
    firstBlock: [{ id: 'decisions.firstBlock' }],
    firstBlockName: [{ id: 'decisions.firstBlockName' }],
    amount: [sum('decisions.amountUsd')],
    merchant: [{ id: 'decisions.merchantName' }],
    item: [{ id: 'decisions.itemName' }],
    status: [{ id: 'decisions.status' }],
    confirmed: [{ id: 'decisions.paypalConfirmed' }],
  },
  format: {
    ...title('Verdict stream', 'Newest first · click a decision to see only it, with its rule trace'),
    style: { maxRows, onlyAlerts, showConfirmed: true, clickToDrill: true },
  },
});

// --- Overview -------------------------------------------------------------------------------------

const overview: Page = {
  id: 'overview',
  widgets: {
    ring: {
      type: 'allowance-ring',
      dataMapping: {
        budget: [sum('mandates.budgetUsd')],
        committed: [sum('mandates.committedUsd')],
        reserved: [sum('mandates.reservedUsd')],
        daysLeft: [{ id: 'mandates.daysLeft', aggregation: 'min' }],
        label: [{ id: 'mandates.name' }],
      },
      format: { ...title('Allowance'), style: { centerMetric: 'remaining', warnAtPct: 80, showDaysLeft: true, animate: true } },
    },
    'kpi-spent': kpi('Spent', sum('decisions.amountUsd'), 'var(--al-allow)', 'paid through PayPal'),
    'kpi-blocked': kpi('Blocked', sum('decisions.amountUsd'), 'var(--al-block)', 'stopped by the guard'),
    'kpi-stepups': kpi('Step-ups', countd('decisions.id'), 'var(--al-stepup)', 'sent to you to approve'),
    'kpi-refunds': kpi('Undone', countd('decisions.id'), 'var(--al-refund)', 'refunded with one click'),
    'spend-by-merchant': {
      type: 'bar-chart-grouped',
      dataMapping: { categoryKey: [{ id: 'decisions.merchantName' }], valueKey: [sum('decisions.amountUsd')] },
      sort: [{ field: sum('decisions.amountUsd'), direction: 'desc' }],
      format: title('Spend by merchant', 'Paid purchases'),
    },
    stream: verdictStream(false, 25),
    'rule-trace': {
      type: 'grid',
      dataMapping: {
        cols: [{ id: 'decisions.at' }, { id: 'decisions.itemName' }, { id: 'rule_results.ruleId' }, { id: 'rule_results.outcome' }, { id: 'rule_results.detail' }],
      },
      sort: [{ field: { id: 'decisions.at' }, direction: 'desc' }],
      format: title('Rule trace', 'Every rule runs on every call · click a decision in the stream to focus on it'),
    },
  },
  widgetLayout: {
    ring: at(0, 0, 8, 20),
    'kpi-spent': at(8, 0, 4, 7),
    'kpi-blocked': at(12, 0, 4, 7),
    'kpi-stepups': at(16, 0, 4, 7),
    'kpi-refunds': at(20, 0, 4, 7),
    'spend-by-merchant': at(8, 7, 16, 13),
    stream: at(0, 20, 11, 30),
    'rule-trace': at(11, 20, 13, 30),
  },
  filter: {
    widget: {
      ring: [isTrue('mandates.current')],
      'kpi-spent': [isIn('decisions.status', 'EXECUTED')],
      'kpi-blocked': [isIn('decisions.verdict', 'BLOCK')],
      'kpi-stepups': [isIn('decisions.verdict', 'STEP_UP')],
      'kpi-refunds': [isIn('decisions.status', 'REFUNDED')],
      'spend-by-merchant': [isIn('decisions.status', 'EXECUTED')],
    },
  },
};

// --- Incidents ------------------------------------------------------------------------------------

const incidents: Page = {
  id: 'incidents',
  widgets: {
    'kpi-attempts': kpi('Blocked attempts', countd('decisions.id'), 'var(--al-block)'),
    'kpi-stopped': kpi('Spend stopped', sum('decisions.amountUsd'), 'var(--al-block)'),
    'kpi-rules': kpi('Rules that fired first', countd('decisions.firstBlock')),
    'kpi-merchants': kpi('Merchants involved', countd('decisions.merchantName')),
    'blocks-by-rule': {
      type: 'column-chart-grouped',
      dataMapping: { categoryKey: [{ id: 'decisions.firstBlockName' }], valueKey: [countd('decisions.id')] },
      sort: [{ field: countd('decisions.id'), direction: 'desc' }],
      format: title('Blocks by rule', 'The first blocking rule that failed'),
    },
    'blocks-by-merchant': {
      type: 'donut-chart',
      dataMapping: { categoryKey: [{ id: 'decisions.merchantName' }], valueKey: [countd('decisions.id')] },
      format: { ...title('Blocks by merchant'), style: { ...legend, custom: { pieDataLabel: { enabled: true } } } },
    },
    blocked: {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'decisions.at' },
          { id: 'decisions.firstBlock' },
          { id: 'decisions.itemName' },
          { id: 'decisions.merchantName' },
          sum('decisions.amountUsd'),
          { id: 'decisions.toolName' },
          { id: 'decisions.source' },
          { id: 'decisions.id' },
        ],
      },
      sort: [{ field: { id: 'decisions.at' }, direction: 'desc' }],
      format: title('Blocked decisions', 'Newest first'),
    },
  },
  widgetLayout: {
    'kpi-attempts': at(0, 0, 6, 7),
    'kpi-stopped': at(6, 0, 6, 7),
    'kpi-rules': at(12, 0, 6, 7),
    'kpi-merchants': at(18, 0, 6, 7),
    'blocks-by-rule': at(0, 7, 14, 18),
    'blocks-by-merchant': at(14, 7, 10, 18),
    blocked: at(0, 25, 24, 24),
  },
  // A page filter: shown (and removable in edit mode) in the Filters panel, applied to every widget.
  filter: { page: [isIn('decisions.verdict', 'BLOCK')] },
};

// --- Attack Lab -----------------------------------------------------------------------------------

const attackLab: Page = {
  id: 'attack-lab',
  widgets: {
    matrix: {
      type: 'attack-lab-matrix',
      dataMapping: {
        family: [{ id: 'lab_results.familyName' }],
        config: [{ id: 'lab_results.config' }],
        successes: [sum('lab_results.successes')],
        runs: [sum('lab_results.runs')],
        holdout: [{ id: 'lab_results.holdout' }],
      },
      format: { ...title('Attack success rate', 'Unguarded agent vs the same agent behind ALLOWANCE'), style: { showCounts: true, decimals: 0, sortBy: 'unguardedAsr' } },
    },
    'asr-bars': {
      type: 'bar-chart-grouped',
      dataMapping: {
        categoryKey: [{ id: 'lab_results.familyName' }],
        valueKey: [{ id: 'lab_results.asr', aggregation: 'avg' }],
        legendKey: [{ id: 'lab_results.config' }],
      },
      format: { ...title('Attack success rate by family', 'Unguarded vs guarded'), style: legend },
    },
    note: note(
      'How to read this: the Attack Lab runs the same shopping agent against scripted attacks (prompt injection, payee swaps, split ' +
        'purchases, "$1 trial" traps, refunds to the attacker) twice: once with no guard, once behind ALLOWANCE. A run counts as a ' +
        'success for the attacker only if money actually moved (judged by code, not by a model). A holdout row appears only when an independently written holdout set has been run.',
    ),
  },
  widgetLayout: {
    matrix: at(0, 0, 12, 28),
    'asr-bars': at(12, 0, 12, 28),
    note: at(0, 28, 24, 7),
  },
};

// --- PayPal ---------------------------------------------------------------------------------------

const paypal: Page = {
  id: 'paypal',
  widgets: {
    'kpi-captured': kpi('Captured', sum('decisions.amountUsd'), 'var(--al-allow)', 'capture ids recorded'),
    'kpi-refunded': kpi('Refunded', sum('decisions.amountUsd'), 'var(--al-refund)', 'refund ids recorded'),
    'kpi-confirmed': kpi('Confirmed by PayPal', countd('decisions.id'), 'var(--al-allow)', 'webhook or GET reconcile'),
    'kpi-awaiting': kpi('Awaiting approval', countd('decisions.id'), 'var(--al-stepup)', 'step-ups open in PayPal'),
    latency: note(
      "Left: ALLOWANCE's own ledger of what PayPal returned (capture and refund ids from the Orders and Payments APIs, " +
        "confirmed by webhook or a GET reconcile). Right: PayPal's own record from the Transaction Search API, matched by " +
        'invoice id = decision id. Transaction Search can take up to 3 hours to show new activity, so a just-made purchase appears on the left first.',
    ),
    transactions: {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'paypal_transactions.at' },
          { id: 'paypal_transactions.eventName' },
          { id: 'paypal_transactions.status' },
          sum('paypal_transactions.amountUsd'),
          { id: 'paypal_transactions.invoiceId' },
          { id: 'paypal_transactions.matched' },
          { id: 'paypal_transactions.id' },
        ],
      },
      sort: [{ field: { id: 'paypal_transactions.at' }, direction: 'desc' }],
      format: title('PayPal Transaction Search', "PayPal's own record (can lag up to 3 hours)"),
    },
    ledger: {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'decisions.at' },
          { id: 'decisions.itemName' },
          { id: 'decisions.merchantName' },
          sum('decisions.amountUsd'),
          { id: 'decisions.status' },
          { id: 'decisions.paypalConfirmed' },
          { id: 'decisions.captureId' },
          { id: 'decisions.refundId' },
          { id: 'decisions.id' },
        ],
      },
      sort: [{ field: { id: 'decisions.at' }, direction: 'desc' }],
      format: title('PayPal ledger', 'Decisions with a PayPal capture, newest first'),
    },
  },
  widgetLayout: {
    'kpi-captured': at(0, 0, 6, 7),
    'kpi-refunded': at(6, 0, 6, 7),
    'kpi-confirmed': at(12, 0, 6, 7),
    'kpi-awaiting': at(18, 0, 6, 7),
    latency: at(0, 7, 24, 5),
    ledger: at(0, 12, 12, 30),
    transactions: at(12, 12, 12, 30),
  },
  filter: {
    widget: {
      'kpi-captured': [notBlank('decisions.captureId')],
      'kpi-refunded': [isIn('decisions.status', 'REFUNDED')],
      'kpi-confirmed': [isTrue('decisions.paypalConfirmed')],
      'kpi-awaiting': [isIn('decisions.status', 'PENDING_APPROVAL')],
      ledger: [notBlank('decisions.captureId')],
    },
  },
};

/** Tab labels for the pages above (Studio state carries no page names). */
export const PAGE_TITLES: Record<string, string> = {
  overview: 'Overview',
  incidents: 'Incidents',
  'attack-lab': 'Attack Lab',
  paypal: 'PayPal',
};

export const controlRoomReport: AgReportState<ControlRoomRegistry> = {
  selectedPageId: overview.id,
  pages: [overview, incidents, attackLab, paypal],
  panels: { filters: { collapsed: true }, ai: { collapsed: true } },
};
