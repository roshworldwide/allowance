'use client';

// The Control Room: a slim header with the View/Edit switch over a full-bleed AG Studio. Every
// non-primitive Studio prop is stable by reference (module constants or useMemo), as the React
// wrapper treats a new reference as a change.

import { useMemo, useState } from 'react';
import { AgStudioAiModule, enableStudioDevValidations, type AgStudioMode } from 'ag-studio';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import { AI_TOOL_DISPLAY, buildAi } from '@/lib/studio/agents';
import { buildDataSources } from '@/lib/studio/datasources';
import { controlRoomReport } from '@/lib/studio/initial-report';
import type { ControlRoomRegistry } from '@/lib/studio/registry';
import { controlRoomTheme } from '@/lib/studio/theme';
import type { ControlRoomData } from '@/lib/studio/types';
import { controlRoomWidgets } from '@/lib/studio/widgets';

if (process.env.NODE_ENV !== 'production') enableStudioDevValidations();

const STUDIO_STYLE = { height: '100%', width: '100%' };
const AI_MODULES = [AgStudioAiModule];

type Props = {
  data: ControlRoomData;
  licenseKey?: string;
  /** OPENAI_MODELS ids; empty when the assistant is not configured, which hides the chat panel. */
  aiModels: string[];
  initialMode: AgStudioMode;
};

export function ControlRoom({ data, licenseKey, aiModels, initialMode }: Props) {
  const [mode, setMode] = useState<AgStudioMode>(initialMode);
  const studioData = useMemo(() => buildDataSources(data), [data]);
  const modelKey = aiModels.join(',');
  // `ai` is read once, at creation.
  const ai = useMemo(() => (modelKey ? buildAi(modelKey.split(','), data) : undefined), [modelKey, data]);

  return (
    <div className="flex h-dvh w-full flex-col bg-ink">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-4">
        <span className="wordmark text-sm text-text">ALLOWANCE</span>
        <h1 className="text-sm text-muted">Control Room</h1>
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">seed data</span>
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
            mode={mode}
          />
        </AgStudioProvider>
      </main>
    </div>
  );
}
