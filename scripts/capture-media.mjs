#!/usr/bin/env node
// npm run media -- <base URL> [out dir]   (default out: docs/media)
// Captures README / Devpost media from a running app with a REAL recorded replay:
//   lane.gif (≈8 s of the Firewall Lane, < 4 MB), errand-lane.png, attack-lab.png, control-room.png,
//   control-room-paypal.png, landing.png, approve-phone.png (if an /approve link is given via APPROVE_URL).
// Refuses synthetic previews unless ALLOW_SYNTHETIC=1 (used only to test this script into a scratch dir).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');
const out = process.argv[3] ?? 'docs/media';
const replayPath = process.env.ALLOW_SYNTHETIC === '1' ? '/replay?preview=1' : '/replay';
mkdirSync(out, { recursive: true });
const vidDir = path.join(out, '.video');
rmSync(vidDir, { recursive: true, force: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: vidDir, size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();
const started = Date.now();
await page.goto(base + replayPath, { waitUntil: 'networkidle' });
if ((await page.getByText('Synthetic preview').count()) && process.env.ALLOW_SYNTHETIC !== '1') {
  console.error('This replay is a synthetic preview — refusing to make README media from it. Record a real run first.');
  process.exit(2);
}
if (await page.getByText('No recorded sandbox run yet.').count()) {
  console.error('No recorded sandbox run on this server yet.');
  process.exit(2);
}
const lane = page.locator('section[aria-label="Firewall Lane"]');
await lane.waitFor();
const box = await lane.boundingBox();
// Let the replay run; grab a mid-run still at the key moment: a BLOCK card if the run has one, otherwise
// the step-up (the recorded hero run is ALLOW cables + STEP-UP lamp, with no injected hub).
await page.getByText('Blocked by R02').or(page.getByText('Needs your approval')).first().waitFor({ timeout: 30_000 }).catch(() => {});
const blockAt = (Date.now() - started) / 1000;
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, 'errand-lane.png') });
await page.waitForTimeout(9000);
await ctx.close();
const video = readdirSync(vidDir).find((f) => f.endsWith('.webm'));

// GIF: 8 s of the lane from just before the block, cropped, 15 fps, 720 px wide, optimised palette.
if (video && box) {
  const start = Math.max(0, blockAt - 4.5).toFixed(2);
  const crop = `crop=${Math.round(box.width)}:${Math.round(box.height)}:${Math.round(box.x)}:${Math.round(box.y)}`;
  const vf = `${crop},fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', start, '-t', '8', '-i', path.join(vidDir, video), '-vf', vf, '-loop', '0', path.join(out, 'lane.gif')]);
  console.log(`lane.gif ${(statSync(path.join(out, 'lane.gif')).size / 1024 / 1024).toFixed(2)} MB`);
}
rmSync(vidDir, { recursive: true, force: true });

// Stills.
const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
for (const [url, file, wait] of [
  ['/', 'landing.png', 500],
  ['/lab', 'attack-lab.png', 500],
  ['/control-room', 'control-room.png', 5000],
]) {
  await p2.goto(base + url, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(wait);
  await p2.screenshot({ path: path.join(out, file) });
}
const paypalTab = p2.getByRole('button', { name: 'PayPal' }).or(p2.getByText('PayPal', { exact: true })).first();
if (await paypalTab.count()) {
  await paypalTab.click();
  await p2.waitForTimeout(2500);
  await p2.screenshot({ path: path.join(out, 'control-room-paypal.png') });
}
if (process.env.APPROVE_URL) {
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await phone.goto(process.env.APPROVE_URL, { waitUntil: 'networkidle' });
  await phone.screenshot({ path: path.join(out, 'approve-phone.png') });
}
await browser.close();

// Fill the README's media markers with exactly the files produced (only when writing into docs/media).
if (out === 'docs/media') {
  const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
  const img = (f, alt) => (existsSync(path.join(out, f)) ? `![${alt}](docs/media/${f})` : '');
  const blocks = {
    hero: img('lane.gif', 'The Firewall Lane on a recorded sandbox run: USB-C cables allowed and paid from the saved wallet, a lamp above the ask-me line sent to PayPal for approval'),
    studio: [img('control-room.png', 'AG Studio Control Room — overview'), img('control-room-paypal.png', 'AG Studio Control Room — PayPal ledger next to ours')].filter(Boolean).join('\n'),
  };
  const readme = readFileSync('README.md', 'utf8').replace(/<!--media:(\w+)-->[\s\S]*?<!--\/media-->/g, (m, k) => (k in blocks ? `<!--media:${k}-->${blocks[k] ? `\n${blocks[k]}\n` : ''}<!--/media-->` : m));
  writeFileSync('README.md', readme);
  console.log('README media markers updated');
}
console.log(`media → ${out}`);
