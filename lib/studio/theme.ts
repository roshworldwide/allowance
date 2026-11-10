// AG Studio theme for the Control Room. Every UI value points at a token from app/globals.css, so
// Studio reads as part of the app: change a token there and the shell, widgets, grids and charts follow.
// Param names verified against node_modules/ag-studio/dist/types/api/theme/*.d.ts (3.1.0).

import { studioTheme } from 'ag-studio';

const v = (name: string) => `var(--al-${name})`;
const line = (color: string) => ({ width: 1, color: v(color) });
const SANS = 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif';

// Chart series colours. Neutral accents first so a generic chart never implies a verdict; verdict
// colours follow for charts whose series are verdicts/outcomes.
const PALETTE = ['accent', 'refund', 'stepup', 'block', 'allow', 'muted'];
const palette = Object.fromEntries(
  PALETTE.flatMap((t, i) => [
    [`chartPaletteFills${i + 1}Color`, v(t)],
    [`chartPaletteStrokes${i + 1}Color`, v(t)],
  ]),
);

export const controlRoomTheme = studioTheme.withParams({
  browserColorScheme: 'dark',
  fontFamily: SANS,
  fontSize: 13,
  textColor: v('text'),
  foregroundColor: v('text'),
  subtleTextColor: v('muted'),
  backgroundColor: v('slate'),
  borderColor: v('line'),
  accentColor: v('accent'),
  iconColor: v('muted'),

  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperBackgroundColor: v('ink'),
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: v('ink'),
  studioCanvasPadding: 16,
  studioCanvasFontFamily: SANS,

  studioWidgetBackgroundColor: v('slate'),
  studioWidgetBorder: line('line'),
  studioWidgetBorderRadius: 14,
  studioWidgetPadding: 10,
  studioWidgetTitleFontFamily: SANS,
  studioWidgetTitleFontSize: 14,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: v('text'),
  studioWidgetSubtitleTextColor: v('muted'),
  studioWidgetCaptionTextColor: v('muted'),

  studioPanelContainerBackgroundColor: v('slate'),
  studioPanelContainerBorder: line('line'),
  studioPanelDividerColor: v('line'),
  studioPanelDividerActiveColor: v('accent'),
  studioToggleButtonActiveBackgroundColor: v('slate-2'),
  studioToggleButtonActiveBorderColor: v('accent'),
  studioToggleButtonActiveColor: v('accent'),

  gridFontFamily: SANS,
  gridCellTextColor: v('text'),
  gridHeaderBackgroundColor: v('slate'),
  gridHeaderTextColor: v('muted'),
  gridHeaderFontWeight: 600,
  gridRowBorder: line('line'),
  gridWrapperBorder: false,

  chartFontFamily: SANS,
  chartTextColor: v('text'),
  chartSubtleTextColor: v('muted'),
  chartAxisLineColor: v('line'),
  chartGridLineColor: v('line'),
  ...palette,
});
