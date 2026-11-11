#!/usr/bin/env node
// npm run video:film -- [base URL] [--only landing,errand,replay,lab,control]
// Films the app for the demo video with Chrome's screencast (lossless-looking JPEG frames + exact timestamps,
// much sharper than a screen recorder) at 1920×1080. Each scene is written to ../video/clips/<scene>/ as
// frames + timeline.json (frame times and named beats), which the edit (scripts/video/assemble.py) cuts to the
// voice-over. The passcode is read from .env.local and never printed.
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), false, { info: () => {}, error: () => {} });

const argv = process.argv.slice(2);
const base = (argv.find((a) => a.startsWith('http')) ?? 'https://allowance-8i38.onrender.com').replace(/\/+$/, '');
const onlyArg = argv[argv.indexOf('--only') + 1];
const only = argv.includes('--only') && onlyArg ? new Set(onlyArg.split(',')) : null;
const OUT = path.resolve(process.cwd(), '..', 'video', 'clips');
// Laptop-sized layout (1440×810 CSS px) rendered at 4/3 device pixels → crisp 1920×1080 frames.
const VW = 1440;
const VH = 810;
const DSF = 4 / 3;
const W = 1920;
const H = 1080;
const ERRAND = 'Get me two USB-C cables under $15 each, a desk lamp under $50 and a monitor arm under $150.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

async function scene(page, name, fn) {
  if (only && !only.has(name)) return;
  const dir = path.join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const marks = [];
  const boxes = {};
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = `${String(frames.length).padStart(5, '0')}.jpg`;
    writeFileSync(path.join(dir, f), Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp ?? now() });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = now();
  const mark = (label) => {
    marks.push({ label, t: now() });
    console.log(`  · ${name}: ${label}`);
  };
  const box = async (label, locator) => {
    const b = await locator.boundingBox().catch(() => null);
    if (b) boxes[label] = b;
  };
  let error = null;
  try {
    await fn({ mark, box });
  } catch (e) {
    error = String(e?.message ?? e).slice(0, 300);
    console.log(`  ! ${name}: ${error}`);
  }
  await sleep(400);
  const tEnd = now();
  await cdp.send('Page.stopScreencast').catch(() => {});
  await cdp.detach().catch(() => {});
  writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ base, t0, tEnd, width: W, height: H, dsf: DSF, frames, marks, boxes, error }, null, 2));
  console.log(`✓ ${name}: ${frames.length} frames, ${(tEnd - t0).toFixed(1)} s${error ? ' (with an error — see above)' : ''}`);
}

async function waitForText(page, re, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (re.test(text)) return true;
    await sleep(100);
  }
  return false;
}

async function main() {
  console.log(`Filming ${base} → ${OUT}`);
  for (let i = 0; i < 40; i++) {
    const ok = await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false);
    if (ok) break;
    if (i === 0) console.log('Waking the server…');
    await sleep(3000);
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, reducedMotion: 'no-preference', colorScheme: 'dark' });
  const page = await ctx.newPage();

  // Warm every page once so the takes don't film a cold load.
  for (const p of ['/', '/replay', '/lab', '/control-room', '/errand']) await page.goto(base + p, { waitUntil: 'networkidle' }).catch(() => {});

  // 1 · Landing: the headline reveal and the gate.
  await page.goto('about:blank');
  await scene(page, 'landing', async ({ mark }) => {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    mark('loaded');
    await sleep(9000);
  });

  // Passcode (session cookie for the errand and the Auditor chat).
  const passcode = process.env.DEMO_PASSCODE;
  await page.goto(base + '/errand', { waitUntil: 'networkidle' });
  if (await page.getByRole('heading', { name: 'Run it live' }).count()) {
    if (!passcode) throw new Error('DEMO_PASSCODE is empty in .env.local');
    await page.getByLabel('Passcode').fill(passcode);
    await page.getByRole('button', { name: 'Enter' }).click();
    await page.getByRole('button', { name: 'Create allowance' }).or(page.getByText('Errand', { exact: true })).first().waitFor({ timeout: 20_000 });
  }

  // 2 · Errand: create the allowance (LIVE), type the errand, contract, confirm. No purchase is made here;
  //     the verdicts in the film come from the recorded sandbox run on /replay.
  await scene(page, 'errand', async ({ mark, box }) => {
    await page.goto(base + '/errand', { waitUntil: 'networkidle' });
    await sleep(1200);
    const create = page.getByRole('button', { name: 'Create allowance' });
    if (await create.count()) {
      mark('create');
      await create.click();
    } else mark('create');
    await waitForText(page, /\bLIVE\b/, 20_000);
    mark('live');
    await sleep(2500);
    const task = page.locator('textarea#task');
    await task.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    mark('type');
    await task.pressSequentially(ERRAND, { delay: 32 });
    await sleep(700);
    mark('contract-click');
    await page.getByRole('button', { name: 'Turn into a task contract' }).click();
    await page.getByRole('button', { name: 'Confirm' }).waitFor({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Confirm' }).evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    mark('contract');
    await box('main', page.locator('main').first());
    await sleep(3000);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.getByRole('button', { name: 'Send the agent' }).waitFor({ timeout: 20_000 });
    mark('confirmed');
    await sleep(2500);
  });

  // 3 · Replay: the recorded sandbox run, with a beat for each verdict.
  await page.goto('about:blank');
  await scene(page, 'replay', async ({ mark, box }) => {
    await page.goto(base + '/replay', { waitUntil: 'domcontentloaded' });
    mark('start');
    const lane = page.locator('section[aria-label="Firewall Lane"]');
    await lane.waitFor({ timeout: 20_000 });
    await sleep(1200);
    // Bring the lane and the caption under it into frame (the task quote scrolls just out of view).
    await lane.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' }));
    await sleep(900);
    mark('lane');
    await box('lane', lane);
    const beats = [
      ['allow', /ALLOW · PAID/],
      ['stepup', /STEP-UP|Needs your approval/],
      ['approved', /APPROVED · PAID/],
      ['block', /\bBLOCK\b|Blocked by R\d\d/],
      ['refund', /REFUNDED/],
    ];
    const seen = new Set();
    const end = Date.now() + 75_000;
    let refundAt = 0;
    while (Date.now() < end) {
      const text = await page.evaluate(() => document.body.innerText).catch(() => '');
      for (const [label, re] of beats) {
        if (seen.has(label) || !re.test(text)) continue;
        seen.add(label);
        mark(label);
        if (label === 'refund') refundAt = Date.now();
      }
      if (refundAt && Date.now() - refundAt > 4000) break; // keep a few seconds after the refund lands
      await sleep(80);
    }
    await sleep(1000);
  });

  // 4 · Attack Lab: the bars grow, then the family table.
  await page.goto('about:blank');
  await scene(page, 'lab', async ({ mark }) => {
    await page.goto(base + '/lab', { waitUntil: 'domcontentloaded' });
    mark('start');
    await sleep(5500);
    mark('scroll');
    await page.evaluate(() => document.querySelector('section[aria-label="Normal errands"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await sleep(1200);
    mark('benign');
    await sleep(4000);
  });

  // 5 · Control Room: overview → PayPal tab → Edit mode (widgets + AI Assistant) → ask the Auditor.
  await page.goto('about:blank');
  await scene(page, 'control', async ({ mark }) => {
    await page.goto(base + '/control-room', { waitUntil: 'domcontentloaded' });
    await waitForText(page, /Verdict stream/, 30_000);
    await sleep(2500);
    mark('overview');
    await sleep(3500);
    await page.getByRole('tab', { name: 'PayPal' }).click();
    mark('paypal');
    await sleep(5000);
    await page.getByRole('tab', { name: 'Overview' }).click();
    await sleep(1200);
    await page.getByRole('button', { name: 'edit', exact: true }).click();
    mark('edit');
    await sleep(3500);
    const ask = page.getByRole('button', { name: 'What if I raise the per-purchase cap to $80?' });
    await ask.waitFor({ timeout: 15_000 });
    mark('ask');
    await ask.click();
    // The answer streams in; wait for the Stop button to appear and go away again (or 75 s).
    const stop = page.getByRole('button', { name: 'Stop' });
    await stop.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    mark('answering');
    await stop.waitFor({ state: 'hidden', timeout: 75_000 }).catch(() => {});
    mark('answer');
    await sleep(6000);
    mark('answer-end');
    await sleep(1500);
  });

  await browser.close();
  console.log(`\nDone → ${OUT}. Tell Claude "film done".`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
