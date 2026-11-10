// /control-room - the AG Studio dashboard. Server component: it hands the client the licence key (by
// design, it unlocks Studio in the browser), the allowed model ids (never the OpenAI key) and the data.
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { ControlRoom } from '@/components/studio/ControlRoom';
import { aiEnabled, allowedModels } from '@/lib/ai/config';
import { SEED_DATA } from '@/lib/studio/seed-data';

export const metadata: Metadata = { title: 'Control Room' };

export default async function ControlRoomPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Env is read per request, not baked in at build time.
  await connection();
  const { mode } = await searchParams;
  // TODO(M5): replace SEED_DATA with the store's rows (same ControlRoomData shape as /api/studio/data).
  return (
    <ControlRoom
      data={SEED_DATA}
      licenseKey={process.env.AG_STUDIO?.trim() || undefined}
      aiModels={aiEnabled() ? allowedModels() : []}
      initialMode={mode === 'edit' ? 'edit' : 'view'}
    />
  );
}
