// Records a live run as a replay for judge mode: the agent's steps plus every live event for the
// allowance (decisions, captures, the phone approval, the undo refund) for up to 15 minutes.
// Nothing secret is in these events; approval links are stripped because they would be stale.
import 'server-only';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ctx, type LiveEvent } from './context';

export type ReplayEvent = { t: number; source: 'run' | 'bus'; type: string; data: unknown };
export type ReplayMeta = {
  id: string;
  recordedAt: string;
  task: string;
  model: string;
  allowance: { name: string; budgetCents: number; perPurchaseCapCents: number; stepUpAboveCents: number };
  /** true only for previews made against a fake PayPal; never shown as a sandbox run. */
  synthetic?: boolean;
  note?: string;
};
export type Replay = { meta: ReplayMeta; events: ReplayEvent[] };

const SKIP_RUN = new Set(['model', 'tool_result', 'verdict']);

function clean(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([k]) => k !== 'approveUrl' && k !== 'approvePage'));
}

export function startRecording(input: { mandateId: string; meta: Omit<ReplayMeta, 'id' | 'recordedAt'>; dir?: string; fileName?: string; windowMs?: number }) {
  const started = Date.now();
  const id = `${new Date(started).toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${input.mandateId.slice(-6)}`;
  const dir = input.dir ?? path.join(process.cwd(), 'replays');
  const file = path.join(dir, input.fileName ?? `${id}.json`);
  const replay: Replay = { meta: { ...input.meta, id, recordedAt: new Date(started).toISOString() }, events: [] };
  const write = () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(replay, null, 1) + '\n');
  };
  const push = (source: ReplayEvent['source'], type: string, data: unknown) => {
    replay.events.push({ t: Date.now() - started, source, type, data: clean(data) });
    write();
  };
  const onBus = (e: LiveEvent) => {
    if (e.mandateId === input.mandateId && e.type !== 'agent' && e.type !== 'mandate') push('bus', e.type, e.data);
  };
  const { bus } = ctx();
  bus.on('event', onBus);
  const stop = () => {
    bus.off('event', onBus);
    clearTimeout(timer);
    write();
  };
  const timer = setTimeout(stop, input.windowMs ?? 15 * 60_000);
  timer.unref?.();
  return {
    file,
    run: (type: string, data: unknown) => {
      if (!SKIP_RUN.has(type)) push('run', type, data);
    },
    stop,
  };
}
