#!/usr/bin/env node
// Dev verification helper: screenshot a page in headless Chromium and print console errors/warnings.
//   node scripts/shot.mjs <url> <out.png> [width] [height]      (SHOT_WAIT=ms extra settle time)
import { chromium } from '@playwright/test';

const [url, out = 'shot.png', w = '1280', h = '800'] = process.argv.slice(2);
if (!url) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [width] [height]');
  process.exit(2);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const messages = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') messages.push(`${m.type()}: ${m.text().slice(0, 400)}`);
});
page.on('pageerror', (e) => messages.push(`pageerror: ${e.message.slice(0, 400)}`));
const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 1500));
await page.screenshot({ path: out });
console.log(`HTTP ${res?.status()} · screenshot → ${out}`);
console.log(messages.length ? messages.join('\n') : 'no console errors or warnings');
await browser.close();
