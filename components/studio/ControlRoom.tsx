'use client';

// The Control Room: a slim header (page tabs, drill-through chip, View/Edit switch) over a
// full-bleed AG Studio. Every non-primitive Studio prop is stable by reference (module constants,
// useState or useMemo), as the React wrapper treats a new reference as a change.
//
// Studio 3.1 has no page switcher of its own: pages live in report state and the host changes
// `selectedPageId` (docs: state/#changing-pages). The tabs below do that, and follow Studio's state
// through onStateUpdated, so a page an agent adds shows up as a tab too.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AgStudioAiModule, enableStudioDevValidations, type AgDrillThroughOptions, type AgStudioApi, type AgStudioMode } from 'ag-studio';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import { AI_TOOL_DISPLAY, buildAi } from '@/lib/studio/agents';
import { buildDataSources } from '@/lib/studio/datasources';
import { PAGE_TITLES, controlRoomReport } from '@/lib/studio/initial-report';
import type { ControlRoomContext, ControlRoomRegistry } from '@/lib/studio/registry';
import { controlRoomTheme } from '@/lib/studio/theme';
import type { ControlRoomData } from '@/lib/studio/types';
import { controlRoomWidgets } from '@/lib/studio/widgets';

if (process.env.NODE_ENV !== 'production') enableStudioDevValidations();

const STUDIO_STYLE = { height: '100%', width: '100%' };
const AI_MODULES = [AgStudioAiModule];
const INITIAL_PAGES = controlRoomReport.pages.map((p) => p.id);

type Props = {
  data: ControlRoomData;
  licenseKey?: string;
  /** OPENAI_MODELS ids; empty when the assistant is not configured, which hides the chat panel. */
  aiModels: string[];
  initialMode: AgStudioMode;
  /** True when nothing has been recorded yet and the dashboard shows sample rows. */
  sample?: boolean;
};

type DrillTarget = { id: string; fieldId: string };

export function ControlRoom({ data, licenseKey, aiModels, initialMode, sample }: Props) {
  const [mode, setMode] = useState<AgStudioMode>(initialMode);
  // Live data: poll while visible and swap the rows in only when something changed (Studio re-loads
  // synchronous sources when the `data` prop changes). Sample mode never polls.
  const [rows, setRows] = useState(data);
  useEffect(() => {
    if (sample) return;
    const sig = (d: ControlRoomData) => `${d.decisions.length}|${d.decisions.map((x) => `${x.id}:${x.status}:${x.paypalConfirmed ? 1 : 0}`).join(',')}|${d.paypal_transactions.length}|${d.lab_results.length}`;
    let last = sig(data);
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/studio/data', { cache: 'no-store' });
        if (!r.ok) return;
        const next = (await r.json()) as ControlRoomData;
        const s = sig(next);
        if (s !== last) {
          last = s;
          setRows(next);
        }
      } catch {
        /* offline: keep the current rows */
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [data, sample]);
  const studioData = useMemo(() => buildDataSources(rows), [rows]);
  const modelKey = aiModels.join(',');
  // `ai` is read once, at creation.
  const ai = useMemo(() => (modelKey ? buildAi(modelKey.split(','), data) : undefined), [modelKey, data]);

  // --- Pages ------------------------------------------------------------------------------------
  const apiRef = useRef<AgStudioApi<ControlRoomRegistry> | null>(null);
  const [pages, setPages] = useState<string[]>(INITIAL_PAGES);
  const [pageId, setPageId] = useState(controlRoomReport.selectedPageId);
  const selectPage = (id: string) => {
    const api = apiRef.current;
    if (!api || id === pageId) return;
    api.setState({ ...api.getState(), selectedPageId: id });
    setPageId(id);
  };

  // --- Drill-through ----------------------------------------------------------------------------
  // The Verdict Stream asks for it through `context` (read once, so the object is created once);
  // the filter itself is the `drillThrough` property, which Studio applies to every data request.
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const [context] = useState<ControlRoomContext>(() => ({ drillToDecision: (target) => setDrill(target) }));
  const drillThrough = useMemo<AgDrillThroughOptions<ControlRoomRegistry> | undefined>(
    () => (drill ? { filter: { field: { id: drill.fieldId }, operator: 'equals', value: drill.id } } : undefined),
    [drill],
  );

  return (
    <div className="flex h-dvh w-full flex-col bg-ink">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-4">
        <span className="wordmark text-sm text-text">ALLOWANCE</span>
        <h1 className="text-sm text-muted">Control Room</h1>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${sample ? 'border-stepup/50 text-stepup' : 'border-allow/50 text-allow'}`}>{sample ? 'sample data' : 'live · sandbox'}</span>
        <nav role="tablist" aria-label="Pages" className="flex items-center gap-1">
          {pages.map((id, i) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === pageId}
              onClick={() => selectPage(id)}
              className={`rounded-md px-2.5 py-1 text-xs ${id === pageId ? 'bg-surface-2 text-text shadow-[inset_0_-2px_0_var(--al-accent)]' : 'text-muted hover:text-text'}`}
            >
              {PAGE_TITLES[id] ?? `Page ${i + 1}`}
            </button>
          ))}
        </nav>
        {drill && (
          <span className="flex items-center gap-2 rounded-full border border-accent/60 px-2 py-0.5 text-[11px] text-text">
            Showing only <code className="font-mono">{drill.id}</code>
            <button type="button" onClick={() => setDrill(null)} className="text-accent hover:underline" aria-label="Clear drill-through and show all decisions">
              Clear
            </button>
          </span>
        )}
        {!ai && <span className="font-mono text-[11px] text-muted">assistant off (no model configured)</span>}
        <div role="group" aria-label="Mode" className="ml-auto flex overflow-hidden rounded-lg border border-line text-xs">
          {(['view', 'edit'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 capitalize ${mode === m ? 'bg-surface-2 text-accent' : 'text-muted hover:text-text'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <AgStudioProvider licenseKey={licenseKey} modules={ai ? AI_MODULES : undefined}>
          <AgStudio<ControlRoomRegistry>
            style={STUDIO_STYLE}
            theme={controlRoomTheme}
            data={studioData}
            widgets={controlRoomWidgets}
            initialState={controlRoomReport}
            ai={ai}
            aiToolDisplay={AI_TOOL_DISPLAY}
            context={context}
            drillThrough={drillThrough}
            mode={mode}
            onApiReady={(event) => {
              apiRef.current = event.api as AgStudioApi<ControlRoomRegistry>;
            }}
            onStateUpdated={(event) => {
              const ids = event.state.pages.map((p) => p.id);
              setPageId(event.state.selectedPageId);
              setPages((prev) => (prev.length === ids.length && prev.every((id, i) => id === ids[i]) ? prev : ids));
            }}
          />
        </AgStudioProvider>
      </main>
    </div>
  );
}
