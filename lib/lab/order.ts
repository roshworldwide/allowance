// Attack Lab job order. Seed-major (every scenario runs once before any runs twice), and within a seed
// each family is spread evenly over the list: a scenario sits at its fractional position inside its own
// family. So any prefix of the job list is a fair sample — a run stopped early by the cost cap still
// covers every attack family and the benign errands in proportion, not just the first families on disk.

export type LabConfig = 'unguarded' | 'guarded';

export function fairOrder<T extends { family: string }>(scenarios: T[]): T[] {
  const byFamily = new Map<string, T[]>();
  for (const s of scenarios) byFamily.set(s.family, [...(byFamily.get(s.family) ?? []), s]);
  const rank = new Map([...byFamily.keys()].map((f, i) => [f, i] as const));
  return [...byFamily.values()]
    .flatMap((group) => group.map((s, i) => ({ s, at: (i + 0.5) / group.length, r: rank.get(s.family) ?? 0 })))
    .sort((a, b) => a.at - b.at || a.r - b.r)
    .map((x) => x.s);
}

export function labJobs<T extends { family: string }>(scenarios: T[], seeds: number): { scenario: T; seed: number; config: LabConfig }[] {
  const ordered = fairOrder(scenarios);
  return Array.from({ length: seeds }, (_, i) => i + 1).flatMap((seed) => ordered.flatMap((scenario) => (['unguarded', 'guarded'] as const).map((config) => ({ scenario, seed, config }))));
}
