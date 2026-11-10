// The Control Room's Studio registry: Studio's built-in widgets plus our own, so report state,
// widget overrides and `aiToolDisplay` are type-checked against everything that can be on a page.
// Widget state shapes live here (types only) so the widget components, the default report and the
// agents can all import them without importing each other.

import type { AgDefaultWidgetDefinition, AgWidgetData, AgWidgetDataFormat, AgWidgetFieldReference } from 'ag-studio';
import type { AgRegistry, AgWidgetDefinition } from 'ag-studio-react';

// --- Allowance Ring ---------------------------------------------------------------------------------

export type RingCenterMetric = 'remaining' | 'committed' | 'percentUsed';

/** Options an analyst sets on the widget's Setup tab (stored under `format.style`). */
export interface AllowanceRingStyle {
  /** What the big number in the middle of the ring shows. */
  centerMetric?: RingCenterMetric;
  /** Show a warning line once committed + reserved reaches this share of the budget (percent). */
  warnAtPct?: number;
  showDaysLeft?: boolean;
  /** Sweep the ring in on load. Always off when the system asks for reduced motion. */
  animate?: boolean;
}

export interface AllowanceRingDataMapping {
  budget: AgWidgetFieldReference[];
  committed: AgWidgetFieldReference[];
  reserved?: AgWidgetFieldReference[];
  daysLeft?: AgWidgetFieldReference[];
  /** Allowance name. When bound, the ring shows the first allowance it returns. */
  label?: AgWidgetFieldReference[];
}

export interface AllowanceRingWidget extends AgWidgetData<AllowanceRingDataMapping, AgWidgetDataFormat<AllowanceRingStyle>> {
  type: 'allowance-ring';
}

export type AllowanceRingDefinition = AgWidgetDefinition<'allowance-ring', AllowanceRingWidget>;

// --- Registry -------------------------------------------------------------------------------------

/** `AgRegistry` (from ag-studio-react) narrows custom components and tool displays to React. */
export interface ControlRoomRegistry extends AgRegistry {
  widgets: readonly (AgDefaultWidgetDefinition | AllowanceRingDefinition)[];
}
