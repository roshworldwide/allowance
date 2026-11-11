// npm run video:clone -- --try        → clone your voice from the sample and speak the opening + closing lines only
// npm run video:clone                 → every line of scripts/video/script.json in your cloned voice
// Options: --sample <file> (default ../video/vo/samples/final_pick.mp3), --model <id> (default eleven_multilingual_v2),
//          --force (re-generate lines), --new-voice (clone again instead of reusing the saved voice id)
//
// Uses ElevenLabs Instant Voice Cloning with YOUR OWN voice sample. Needs ELEVENLABS_API_KEY in .env.local
// (you paste it; it is never printed). Output goes outside the repo: ../video/vo/final_pick/*.mp3 + manifest.json,
// which scripts/video/assemble.py reads with --voice final_pick.
import '../_env';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Line = { tts: string; caption: string; pause: number; beat?: string };
type Section = { id: string; lines: Line[] };

const API = 'https://api.elevenlabs.io/v1';
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (k: string) => args.includes(`--${k}`);

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('ELEVENLABS_API_KEY is empty. Add a line ELEVENLABS_API_KEY=... to .env.local (paste it yourself), save, and run again.');
  process.exit(1);
}
const voDir = path.resolve(process.cwd(), '..', 'video', 'vo');
const sample = path.resolve(opt('sample') ?? path.join(voDir, 'samples', 'final_pick.mp3'));
const outDir = path.join(voDir, 'final_pick');
const voiceFile = path.join(voDir, 'clone-voice.json');
const model = opt('model') ?? 'eleven_multilingual_v2';
const sections = (JSON.parse(readFileSync(path.join(process.cwd(), 'scripts/video/script.json'), 'utf8')) as { sections: Section[] }).sections;

function explain(status: number, body: string): string {
  if (status === 401) return 'ElevenLabs rejected the API key (401). Check ELEVENLABS_API_KEY in .env.local.';
  if (/voice_clon|instant|subscription|plan|upgrade|quota|credits/i.test(body) || status === 402 || status === 403)
    return `ElevenLabs says your plan can't do this (${status}): ${body.slice(0, 220)}\nInstant Voice Cloning may need a paid plan, or you may be out of credits.`;
  return `ElevenLabs error ${status}: ${body.slice(0, 300)}`;
}

async function cloneVoice(): Promise<string> {
  if (!has('new-voice') && existsSync(voiceFile)) {
    const saved = JSON.parse(readFileSync(voiceFile, 'utf8')) as { voice_id: string; sample: string };
    if (saved.sample === sample) return saved.voice_id;
  }
  if (!existsSync(sample)) throw new Error(`Sample not found: ${sample}`);
  const form = new FormData();
  form.append('name', 'Roshan — ALLOWANCE demo');
  form.append('description', "Roshan Raj's own voice, cloned from his own recording for the ALLOWANCE hackathon demo video.");
  form.append('remove_background_noise', 'true');
  const ext = path.extname(sample).slice(1).toLowerCase();
  const type = ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`;
  form.append('files', new Blob([readFileSync(sample)], { type }), path.basename(sample));
  const r = await fetch(`${API}/voices/add`, { method: 'POST', headers: { 'xi-api-key': key! }, body: form });
  const body = await r.text();
  if (!r.ok) throw new Error(explain(r.status, body));
  const j = JSON.parse(body) as { voice_id: string; requires_verification?: boolean };
  if (j.requires_verification) console.log('Note: ElevenLabs wants this voice verified in its dashboard before full use.');
  writeFileSync(voiceFile, JSON.stringify({ voice_id: j.voice_id, sample, createdAt: new Date().toISOString() }, null, 2));
  console.log('✓ voice cloned from your sample');
  return j.voice_id;
}

async function speak(voiceId: string, text: string, file: string, prev?: string, next?: string) {
  const r = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key!, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      // Calm and consistent, close to the sample; a little style for warmth.
      voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true },
      ...(prev ? { previous_text: prev } : {}),
      ...(next ? { next_text: next } : {}),
    }),
  });
  if (!r.ok) throw new Error(explain(r.status, await r.text()));
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

async function main() {
  const voiceId = await cloneVoice();
  mkdirSync(outDir, { recursive: true });
  const all = sections.flatMap((s) => s.lines.map((l, i) => ({ s, l, i })));
  const pick = has('try') ? all.filter((x) => x.s.id === 's01' || x.s.id === 's12') : all;
  const manifest: { section: string; index: number; file: string; caption: string; pause: number; beat?: string }[] = [];
  for (const x of pick) {
    const k = all.indexOf(x);
    const name = `${x.s.id}-${String(x.i + 1).padStart(2, '0')}.mp3`;
    const file = path.join(outDir, name);
    if (has('force') || !existsSync(file)) {
      await speak(voiceId, x.l.tts, file, all[k - 1]?.l.tts, all[k + 1]?.l.tts);
      console.log(`✓ ${x.s.id} ${x.i + 1}  ${x.l.caption}`);
    } else console.log(`· ${x.s.id} ${x.i + 1}  (kept)`);
    manifest.push({ section: x.s.id, index: x.i, file: name, caption: x.l.caption, pause: x.l.pause, beat: x.l.beat });
  }
  if (!has('try')) writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ voice: 'final_pick', provider: 'elevenlabs', model, lines: manifest }, null, 2));
  console.log(
    has('try')
      ? `\nListen to ${outDir}/s01-*.mp3 and s12-*.mp3. Happy? Run: npm run video:clone`
      : `\nDone: ${manifest.length} lines in ${outDir}. Tell Claude "voice done".`,
  );
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
