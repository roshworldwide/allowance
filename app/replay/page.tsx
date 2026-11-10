// Judge mode: watch a real recorded sandbox run, no passcode or keys needed.
import type { Metadata } from 'next';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ReplayPlayer, type ReplayFile } from '@/components/errand/ReplayPlayer';
import { TopBar } from '@/components/ui';

export const metadata: Metadata = { title: 'Replay' };
export const dynamic = 'force-dynamic';

function load(preview: boolean, id?: string): ReplayFile | null {
  if (preview && (process.env.NODE_ENV !== 'production' || process.env.E2E === '1')) {
    const f = path.join(process.cwd(), 'tests', 'fixtures', 'replay-preview.json');
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as ReplayFile) : null;
  }
  const dir = path.join(process.cwd(), 'replays');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse();
  const pick = (id && files.find((f) => f === `${id}.json`)) || files[0];
  if (!pick) return null;
  const r = JSON.parse(readFileSync(path.join(dir, pick), 'utf8')) as ReplayFile;
  return r.meta.synthetic ? null : r; // synthetic previews are never shown as sandbox runs
}

export default async function ReplayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const replay = load(q.preview === '1', typeof q.id === 'string' ? q.id : undefined);
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      {replay ? (
        <ReplayPlayer replay={replay} />
      ) : (
        <main className="mx-auto max-w-lg px-6 py-20 text-center text-muted">No recorded sandbox run yet.</main>
      )}
    </div>
  );
}
