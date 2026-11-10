// The Control Room's default report: one "Overview" page. Field ids ('decisions.verdict') refer to
// ./datasources.ts. Layout is Studio's 24-column canvas grid (xTrack/yTrack/xSpan/ySpan).

import type { AgPageState, AgReportState, AgWidgetLayoutState } from 'ag-studio';
import type { ControlRoomRegistry } from './registry';

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const countDecisions = { id: 'decisions.id', aggregation: 'countd' as const };

const kpi = (text: string, value: { id: string; aggregation: 'sum' | 'countd' }, color?: string) => ({
  type: 'value' as const,
  dataMapping: { value: [value] },
  format: { ...title(text), style: color ? { color } : {} },
});

const verdictIs = (...verdicts: string[]) => [{ field: { id: 'decisions.verdict' }, model: { operator: 'isIn' as const, value: verdicts } }];

const overview: AgPageState<ControlRoomRegistry> = {
  id: 'overview',
  widgets: {
    ring: {
      type: 'allowance-ring',
      dataMapping: {
        budget: [{ id: 'mandates.budgetUsd', aggregation: 'sum' }],
        committed: [{ id: 'mandates.committedUsd', aggregation: 'sum' }],
        reserved: [{ id: 'mandates.reservedUsd', aggregation: 'sum' }],
        daysLeft: [{ id: 'mandates.daysLeft', aggregation: 'min' }],
        label: [{ id: 'mandates.name' }],
      },
      format: { ...title('Allowance'), style: { centerMetric: 'remaining', warnAtPct: 80, showDaysLeft: true, animate: true } },
    },
    'kpi-decisions': kpi('Decisions', countDecisions),
    'kpi-blocked': kpi('Blocked', countDecisions, 'var(--al-block)'),
    'kpi-stepups': kpi('Sent for approval', countDecisions, 'var(--al-stepup)'),
    'kpi-stopped': kpi('Spend stopped', { id: 'decisions.amountUsd', aggregation: 'sum' }, 'var(--al-block)'),
    'rules-fired': {
      type: 'column-chart-stacked',
      dataMapping: {
        categoryKey: [{ id: 'rule_results.ruleName' }],
        valueKey: [{ id: 'rule_results.decisionId', aggregation: 'count' }],
        legendKey: [{ id: 'rule_results.outcome' }],
      },
      format: { ...title('Rules that fired (FAIL blocks, STEP_UP asks)'), style: { theme: { common: { legend: { enabled: true } } } } },
    },
    decisions: {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'decisions.at' },
          { id: 'decisions.verdict' },
          { id: 'decisions.firstBlock' },
          { id: 'decisions.firstBlockName' },
          { id: 'decisions.merchantName' },
          { id: 'decisions.itemName' },
          { id: 'decisions.amountUsd', aggregation: 'sum' },
          { id: 'decisions.status' },
          { id: 'decisions.source' },
          { id: 'decisions.id' },
        ],
      },
      sort: [{ field: { id: 'decisions.at' }, direction: 'desc' }],
      format: title('Decisions, newest first'),
    },
  },
  widgetLayout: {
    ring: at(0, 0, 9, 16),
    'kpi-decisions': at(9, 0, 4, 8),
    'kpi-blocked': at(13, 0, 4, 8),
    'kpi-stepups': at(17, 0, 4, 8),
    'kpi-stopped': at(21, 0, 3, 8),
    'rules-fired': at(9, 8, 15, 16),
    decisions: at(0, 24, 24, 22),
  },
  filter: {
    widget: {
      'kpi-blocked': verdictIs('BLOCK'),
      'kpi-stepups': verdictIs('STEP_UP'),
      'kpi-stopped': verdictIs('BLOCK'),
      'rules-fired': [{ field: { id: 'rule_results.outcome' }, model: { operator: 'isIn', value: ['FAIL', 'STEP_UP'] } }],
    },
  },
};

export const controlRoomReport: AgReportState<ControlRoomRegistry> = {
  selectedPageId: overview.id,
  pages: [overview],
  panels: { filters: { collapsed: true }, ai: { collapsed: true } },
};
