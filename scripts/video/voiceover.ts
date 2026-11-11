// npm run video:voice -- --samples          → the cold open in several voices, to pick one
// npm run video:voice -- --voice <name>     → every line of scripts/video/script.json, one WAV per line
// Options: --model <id> (default: gpt-4o-mini-tts, falls back to tts-1-hd), --force (re-generate), --out <dir>
// Uses the OpenAI key in .env.local (AG_STUDIO_OPENAI_API_KEY). Never prints it. Output goes OUTSIDE the
// repo (../video/vo by default) so audio never lands in git.
import '../_env';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';

type Line = { tts: string; caption: string; pause: number; beat?: string };
type Section = { id: string; name: string; visual: string; lines: Line[] };
type Script = { voiceInstructions: string; sections: Section[] };

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (k: string) => args.includes(`--${k}`);

const script = JSON.parse(readFileSync(path.join(process.cwd(), 'scripts/video/script.json'), 'utf8')) as Script;
const out = path.resolve(opt('out') ?? path.join(process.cwd(), '..', 'video', 'vo'));
const key = process.env.AG_STUDIO_OPENAI_API_KEY;
if (!key) {
  console.error('AG_STUDIO_OPENAI_API_KEY is empty in .env.local.');
  process.exit(1);
}
const client = new OpenAI({ apiKey: key });
const MODELS = opt('model') ? [opt('model')!] : ['gpt-4o-mini-tts', 'tts-1-hd'];
let model = MODELS[0]!;

async function speak(voice: string, text: string, file: string) {
  for (;;) {
    try {
      const res = await client.audio.speech.create({
        model,
        voice: voice as 'alloy',
        input: text,
        response_format: 'wav',
        ...(model.startsWith('gpt-') ? { instructions: script.voiceInstructions } : {}),
      } as Parameters<typeof client.audio.speech.create>[0]);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const next = MODELS[MODELS.indexOf(model) + 1];
      if (next && /model|not found|does not exist|404|unsupported/i.test(msg)) {
        console.log(`  model ${model} unavailable → trying ${next}`);
        model = next;
        continue;
      }
      throw new Error(`TTS failed (${model}, voice ${voice}): ${msg.slice(0, 200)}`);
    }
  }
}

async function main() {
  if (has('samples')) {
    const voices = (opt('voices') ?? 'ash,onyx,cedar,sage,ballad,verse').split(',');
    const dir = path.join(out, 'samples');
    mkdirSync(dir, { recursive: true });
    const text = script.sections[0]!.lines.map((l) => l.tts).join(' ') + ' ' + script.sections[11]!.lines.map((l) => l.tts).join(' ');
    for (const v of voices) {
      const file = path.join(dir, `${v}.wav`);
      try {
        await speak(v, text, file);
        console.log(`✓ ${path.relative(process.cwd(), file)}`);
      } catch (e) {
        console.log(`✗ ${v}: ${(e as Error).message}`);
      }
    }
    console.log(`\nListen to each file in ${dir}, then run: npm run video:voice -- --voice <name>`);
    return;
  }

  const voice = opt('voice');
  if (!voice) {
    console.error('Pick a voice: npm run video:voice -- --voice <name>   (try --samples first)');
    process.exit(1);
  }
  const dir = path.join(out, voice);
  mkdirSync(dir, { recursive: true });
  const manifest: { section: string; index: number; file: string; caption: string; pause: number; beat?: string }[] = [];
  for (const s of script.sections) {
    for (const [i, l] of s.lines.entries()) {
      const name = `${s.id}-${String(i + 1).padStart(2, '0')}.wav`;
      const file = path.join(dir, name);
      if (has('force') || !existsSync(file)) {
        await speak(voice, l.tts, file);
        console.log(`✓ ${s.id} ${i + 1}  ${l.caption}`);
      } else console.log(`· ${s.id} ${i + 1}  (kept)`);
      manifest.push({ section: s.id, index: i, file: name, caption: l.caption, pause: l.pause, beat: l.beat });
    }
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ voice, model, createdAt: new Date().toISOString(), lines: manifest }, null, 2));
  console.log(`\nDone: ${manifest.length} lines in ${dir} (model ${model}). Tell Claude "voice done".`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
