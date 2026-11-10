# AG Studio 3.1.0 — verified API notes (Control Room)

Sources: 3.1.0 React docs as Markdown (`https://www.ag-grid.com/studio/archive/3.1.0/react/<slug>.md`,
index at `https://www.ag-grid.com/studio/archive/3.1.0/llms.txt`), example sources under
`.../archive/3.1.0/examples/<page>/<example>/reactFunctionalTs/<file>`, and the installed
`node_modules/ag-studio/dist/types` + `ag-studio-react/dist/types` (ground truth). Read 2026-11-10.
"✓ types" = checked by `tsc` against the installed 3.1.0 types. "UNVERIFIED" = not run in a browser.

## Resolved: `ag-grid-community` must be a root dependency
`ag-studio`'s bundle imports `ag-grid-community` without listing it; it is now pinned at the root
(`36.3.0`, the version ag-grid-enterprise 36.3.0 pins). Without it `next dev` fails with
`Can't resolve 'ag-grid-community'`.

## Verified in a browser (2026-11-10, dev and `next build && next start`, 1280×800)
- Four-page report, Allowance Ring, Verdict Stream, Attack Lab Matrix, chip cell renderers, drill-through,
  edit-mode Form Configuration (options change the widget live), prod CSP (no `'unsafe-eval'`) all work;
  only console errors are the no-licence banner.
- CSS variables in theme params (`var(--al-accent)`) do colour chart canvases.

## Pages and navigation (`state` #changing-pages)
- No built-in page switcher in 3.1: pages live in `initialState.pages`, the host shows tabs and calls
  `api.setState({ ...api.getState(), selectedPageId })`. State has no page names: keep your own map.
  `onStateUpdated(event)` gives `event.state` to follow pages an agent adds.

## Drill-through from a custom widget (`drill-through`) - verified
- A widget can trigger it: `params.api.setProperty('drillThrough', { filter: { field: { id: field.fieldId }, operator: 'equals', value } })`
  (or the host sets the React `drillThrough` prop). It constrains every data request on every page, so
  a rule_results grid joined to decisions shows that decision's 12 rules. The Filters-panel card is
  read-only: provide your own clear control (`setProperty('drillThrough', undefined)` / prop `undefined`).
- `params.api.getProperty('drillThrough')` lets the widget highlight the drilled row.
- Host → widget callbacks: Studio's `context` property (`@initial`, keep it stable) arrives as `params.context`.

## Grid cell renderers (`widget-configuration` #cell-renderers) - verified
- `createWidgets({ overrides: [{ id: 'grid', options: { createCellRenderer: (field) => Comp | undefined } }] })`;
  opt fields in with `context` on the field definition (`field.context`). React renderer props:
  `AgWidgetCustomCellRendererProps` (ag-studio-react). The total row calls the renderer with `value` null.

## Chain Seal: exact values through Studio, async work in a widget - verified
- Values that must reach a widget byte for byte (the hashed `at` timestamp, canonical JSON payloads) are
  declared `textFormat`: a `dateTimeFormat` field is parsed, and the original string cannot be rebuilt.
- A page filter on a table with no relationship to the widget's table does not reduce its rows: the
  Chain Seal on Incidents (page filter `decisions.verdict = BLOCK`) still reads all of `chain_events`.
  Cross filters are switched off per request with `getData(query, { crossFilter: 'none' })`.
- Async work after `use(getData)` (WebCrypto here) goes in `useEffect` keyed on `response.results.rows`
  (stable while the query is unchanged); creating the promise during render and passing it to `use`
  re-suspends forever.

## Field roles (from the 3.1 bundle source)
- boolean fields have role `category` (aggregations count/countd/first/last); numbers `numeric`+`category`.
- Custom widget queries: `widgetApi.getData({ fields, filter: [{ field, operator: 'isIn', value }], sort: [{ field, direction }], limit: { count } })` - verified.
- `createDefaults` always adds a Cross-Filtering section, even for widgets that do not cross-filter.

## Licence / modules
- `<AgStudioProvider licenseKey modules={[AgStudioAiModule]}>` (ag-studio-react). Without a key: watermark + console warning. ✓ types. Docs: `licence-install`, `ai-quickstart`.
- AI is opt-in: register `AgStudioAiModule`; `ai` is `@initial`. `getAiContext()` is inert without the module.

## Theme (`theming`, `studio-theme`)
- `studioTheme.withParams({...}, mode?)`; params are shared (no prefix), `studio*`, `grid*`, `chart*`. Names used in `lib/studio/theme.ts` all ✓ types (incl. `browserColorScheme: 'dark'`, `chartPaletteFills{n}Color`).
- CSS var values (`var(--al-ink)`) in params: verified in 3.1, including chart canvas colours.
- No per-widget chart palette in 3.1 chart format types (`AgChartStyle` = `theme.common` legend/navigator/zoom + `custom`); series colours come from the global palette by index.

## Data (`data`, `data-modelling`, `loading-data`, `live-data`)
- `data = { sources: [{ id, name?, description?, primaryKeyField?, transactions?, data, fields }], relationships, expressions, calendars, formats, description, options }`.
- Relationships: `{ id, source: 'table.field', target: 'table.field', type: 'many-to-one' }` (string refs are the documented 3.1 form; `{tableId, fieldId}` also accepted). New in 3.1: composite `conditions: [...]`, `::unit` date joins, fan-out detection (`options.fanout`).
- Field: `{ id, name, format: 'currencyFormat'|..., formatOptions: { format: '$#,##0.00' }, hide, description }`.
- Live Data (new in 3.1): source `transactions: 'none'|'add'|'all'` (`'all'` needs `primaryKeyField`); after `onStudioReady`, `api.getDataEngine()?.applyTransaction({ tableId, add, update, remove })` (array = atomic multi-table). Widgets reading changed tables re-query. Replacing the `data` prop re-loads sync sources; adding/removing sources after init is ignored.

## Custom widgets + Form Configuration (`custom-widgets`, `custom-widgets-form`, `registry-type`)
- Register via `widgets={(defaults) => createWidgets<Reg>({ additionalTypes: [def], menu: [..., ...defaults.menu] })}`; import `createWidgets` from **ag-studio-react**.
- Registry for React: extend `AgRegistry` from ag-studio-react (`widgets: readonly (AgDefaultWidgetDefinition | MyDef)[]`) — it narrows `aiToolDisplay.detail` and `comp` to React.
- Definition: `id, label, icon (string SVG parsed as HTML | {className} | {url}), dataMapping: { key: { type:'field'|'fieldset', supportedRoles, requires:{cardinality,per?}, required, aiDescription } }, form, comp, defaultSize, minSize, defaultState?, formatShape?, ai: { label, description, usage, configuration }` ✓ types.
- `form: (p) => p.createDefaults({ dataMappingItems: [{key,label}] })` returns Setup/Format tab group; push your section into `items[0].items` (`{ type:'section', key, label, items:[{ type:'select'|'number'|'checkbox'|'toggle'|..., id:'format.style.x', label, defaultValue }] }`). Ids are typed paths of the widget state ✓ types.
- Component props `AgWidgetParams<W>`: `dataMapping` (hydrated `AgWidgetField[]`), `format`, `widgetApi.getData({ fields })` (equal query → same promise, so React `use()` works), `widgetApi.formatFieldValue`, overlays `AgIncompleteDataMappingOverlay`/`AgNoDataOverlay` from ag-studio-react. Also `getDataHandle`, `onDataUpdated` for live data.
- `formatShape` is required for AI to set a custom widget's `format`; **no public shape constructor for it was found** in 3.1 docs/types (only internal). Not implemented — the AI can add/bind the ring but not edit its style options.

## Agent Framework (`ai`, `ai-builtin-harness`, `ai-agents`, `ai-builtin-agents`, `ai-custom-agents`)
- `ai = (params) => createAiHarness(api, builderOrDefaults)`. Builder gets `{ builtIn, tools }`; return `{ agents, primary, models?, promptStarters?, history?, observers? }`.
- **Types quirk**: the setup param is typed `AgCoreStudioApi`, but `createAiHarness`/`defineAiTool` want `AgStudioApi`; the docs pass it straight through, so we cast (`lib/studio/agents.ts`).
- Built-ins: `builtIn.{lead,planning,data,page,widget}` are plain definitions → `directLlmRunner({ ...def, adapter })`.
- Custom lead: built-in lead "delegates to a fixed set of ids, so it will not discover [your agent] … declare your own lead with a wider delegateTo". We spread `builtIn.lead`, keep its tools minus `delegate_to`, add `ctx.tools.delegateTo(['data','page','planning','widget','auditor'])` (tools callback is `(ctx: {api, studio, tools}, params)`).
- Delegate target needs `description`; param-less agents must declare `schema: (s) => s.undefined()`.
- Prompt starters: `{ label, prompt, icon? }` on the harness config. Models: `{ id, label, efforts? }`, picker only shown when listed; adapter gets `request.model.{id,effort}`.
- Conversations live in the harness (in memory unless `history` store) — not in report state since 3.0.

## Custom tools (`ai-custom-tools`, `ai-tools`, `ai-tools-builtin`)
- `api.defineAiTool({ name, description, params: (s) => s.object({ x: s.string({ description }) }), execute: (args, ctx) => ctx.success(text, data) | ctx.error(msg) })`. `data` goes to the model AND the tool component. Also `{ command, result }`, `kind:'server'|'provided'`.
- Built-in studio tools: `viewSchema, viewReport, viewPage, viewWidget, executeQuery, add/position/removeWidget, configureWidget({widgetType}), create/update/deleteExpression, add/removePageFilter, add/removeWidgetFilter`; per-listing `{ name, description, pageId }`. Harness tools: `plan.view/create/update/clear, renameThread, delegateTo`.

## Tool Components (`ai-tool-components`) — exists in 3.1
- Studio property `aiToolDisplay: { [toolName]: { label: ({args,status,result,...}) => ({ text, pill? }), detail?: ReactComponent<AgAiToolDetailParams>, hidden? } }`. Keyed by name so replays render. Type the React detail with default `AgAiToolDetailParams` and narrow `result.data` at runtime (generic params are not assignable). Implemented: `lib/studio/tool-components/RuleLampStrip.tsx`.

## Building pages programmatically (commands)
- `api.defineAiCommand({ type: 'AgAddWidgetCommand' }).apply({ widgetId, type, xTrack, yTrack, xSpan, ySpan })`, then `defineAiCommand({ type:'AgConfigureWidgetCommand', params:{ widgetType } }).apply({ op:'patch', widgetId, value:{ dataMapping, format } })`. Others: AgPositionWidget, AgRemoveWidget, AgAdd/RemovePageFilter, AgAdd/RemoveWidgetFilter, AgExecuteQuery. Commands never throw: check `result.success`. Docs: `ai-tools` ("Build from a template").
- Or whole state: `api.setState(next, { label })` (3.1 adds history label); `getState()` object is Studio's own — copy, don't mutate.
- Page filters in state: `page.filter.page[]` / `page.filter.widget[widgetId][] = { field:{id}, model:{ operator:'isIn', value:[...] } }` ✓ types.

## Drill-through (`drill-through`, new in 3.1)
- `drillThrough={{ filter }}` or `api.setProperty('drillThrough', { filter })`; read-only card in Filters panel, not saved in state. Trigger from `getContextMenuItems(params)` using `params.filter`. Tables can highlight instead (`format.drillThrough: 'highlight'`).

## CSP (`security`)
- Needs `style-src 'unsafe-inline'` (or `styleNonce`), `img-src data:`. Chat renders images as links. Our CSP satisfies both; the production build runs without `'unsafe-eval'` (verified).

## OpenAI adapter
- 3.1.0 example `shared/openaiAdapter.tsx` is byte-identical to the 3.0.0 one. It always sends `reasoning.effort` (default `'medium'`): OPENAI_MODELS must be reasoning models, or the proxy must drop `reasoning`.
