'use client';

// Grid (table) cell renderers for Studio's built-in grid widget: verdict, rule, status, outcome and
// PayPal-confirmed columns render as chips. A field opts in through `context.cellRenderer` on its
// definition (../datasources.ts), and the grid widget override in ./index.ts maps that to a component.
// Docs: https://www.ag-grid.com/studio/archive/3.1.0/react/widget-configuration/#cell-renderers

import type { AgGridWidgetOptions, AgWidgetCustomCellRendererProps } from 'ag-studio-react';
import { ConfirmedTick, OutcomeChip, RuleChip, StatusChip, VerdictChip, isOutcome, isRuleId, isStatus, isVerdict } from './chips';

export type CellRendererKind = 'verdict' | 'rule' | 'status' | 'outcome' | 'confirmed';

const Fallback = ({ value, valueFormatted }: AgWidgetCustomCellRendererProps) => <span>{valueFormatted ?? String(value ?? '')}</span>;

function VerdictCell(props: AgWidgetCustomCellRendererProps) {
  return isVerdict(props.value) ? <VerdictChip verdict={props.value} /> : <Fallback {...props} />;
}
function RuleCell(props: AgWidgetCustomCellRendererProps) {
  if (props.value === '' || props.value == null) return <span aria-label="none" />;
  return isRuleId(props.value) ? <RuleChip ruleId={props.value} /> : <Fallback {...props} />;
}
function StatusCell(props: AgWidgetCustomCellRendererProps) {
  return isStatus(props.value) ? <StatusChip status={props.value} /> : <Fallback {...props} />;
}
function OutcomeCell(props: AgWidgetCustomCellRendererProps) {
  return isOutcome(props.value) ? <OutcomeChip outcome={props.value} /> : <Fallback {...props} />;
}
function ConfirmedCell({ value }: AgWidgetCustomCellRendererProps) {
  if (value === true) return <ConfirmedTick />;
  // null/undefined: the grid's total row, which has no single value here.
  return value === false ? <span style={{ color: 'var(--al-muted)', fontSize: 11 }}>not yet</span> : null;
}

const RENDERERS: Record<CellRendererKind, (props: AgWidgetCustomCellRendererProps) => React.ReactNode> = {
  verdict: VerdictCell,
  rule: RuleCell,
  status: StatusCell,
  outcome: OutcomeCell,
  confirmed: ConfirmedCell,
};

export const GRID_OPTIONS: AgGridWidgetOptions = {
  createCellRenderer: (field) => {
    const kind = (field.context as { cellRenderer?: CellRendererKind } | undefined)?.cellRenderer;
    // Aggregated columns (count of verdicts, …) keep Studio's own rendering.
    return kind && field.type !== 'implicitMeasure' ? RENDERERS[kind] : undefined;
  },
};
