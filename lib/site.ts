// Site-wide facts for the landing page, /lab and the README: links and the latest Attack Lab numbers.
// Every number shown comes from lab/results/latest.json (written by `npm run lab`).
import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { LabSummary } from '@/lib/lab/metrics';

export const SITE = {
  /** Filled in at G4 (public YouTube video). Empty hides the button. */
  videoUrl: process.env.DEMO_VIDEO_URL ?? '',
  /** Filled in at G2 (public repo). */
  repoUrl: process.env.REPO_URL ?? '',
  author: 'Roshan Raj',
};

export type LabFile = {
  meta: { kind: string; model: string; date: string; seeds: number; gitSha: string; scenarios: number; runsDone: number; runsPlanned: number; stoppedByCostCap: boolean; estimatedCostUsd: number; humanModel: string; judge: string };
  summary: LabSummary;
};

export function readLab(file: 'latest.json' | 'holdout-latest.json' = 'latest.json'): LabFile | null {
  const p = path.join(process.cwd(), 'lab', 'results', file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as LabFile;
  } catch {
    return null;
  }
}

export const pct = (r: { rate: number } | undefined | null) => (r ? `${(r.rate * 100).toFixed(r.rate > 0 && r.rate < 0.1 ? 1 : 0)}%` : '—');
