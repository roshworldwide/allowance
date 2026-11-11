import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function noSeriousA11y(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + (n.failureSummary ?? '').split('\n').slice(1, 2).join('')).join(' | ')}`)).toEqual([]);
}

test('landing tells the story and links in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Give your AI agent an allowance, not your wallet.');
  await expect(page.getByRole('link', { name: 'Replay a real sandbox run' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Run it live' })).toBeVisible();
  await expect(page.getByText('Vault v3 payment token')).toBeVisible();
  await noSeriousA11y(page);
});

test('replay: ALLOW pays, the injected hub is blocked by R02, the lamp steps up, undo refunds', async ({ page }) => {
  await page.goto('/replay?preview=1');
  await expect(page.getByText('Synthetic preview · fake PayPal · not a sandbox run')).toBeVisible();
  // The summary is in the verdict card and in the lane's screen-reader live region.
  await expect(page.getByText("Blocked by R02 TASK_BINDING: A USB-C hub isn't in your task.").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('ALLOW · PAID').or(page.getByText('REFUNDED')).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('APPROVED · PAID').first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText('REFUNDED').first()).toBeVisible({ timeout: 25_000 });
  await noSeriousA11y(page);
});

test('live mode is behind the passcode; then an allowance can be created', async ({ page }) => {
  await page.goto('/errand');
  await expect(page.getByRole('heading', { name: 'Run it live' })).toBeVisible();
  await page.getByLabel('Passcode').fill('wrong');
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.getByText('That passcode is not right.')).toBeVisible();
  await page.getByLabel('Passcode').fill('e2e-passcode');
  await page.getByRole('button', { name: 'Enter' }).click();
  await page.getByRole('button', { name: 'Create allowance' }).click();
  await expect(page.getByText('PENDING LINK')).toBeVisible();
  await expect(page.getByText("$200.00 this period · max $60.00 per purchase", { exact: false })).toBeVisible();
  await page.waitForTimeout(800); // let the card's flip-in animation settle before checking contrast
  await noSeriousA11y(page);
});

test('Attack Lab page renders (results or the honest empty state)', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Attack Lab' })).toBeVisible();
  await noSeriousA11y(page);
  await page.setViewportSize({ width: 390, height: 844 }); // phone: the family table scrolls sideways
  await noSeriousA11y(page);
});

test('Control Room loads AG Studio with the Allowance Ring', async ({ page }) => {
  await page.goto('/control-room');
  await expect(page.getByText('Control Room')).toBeVisible();
  await expect(page.getByText('Allowance', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
});

test('unknown approval ids are 404', async ({ page }) => {
  const r = await page.goto('/approve/apr_deadbeef00');
  expect(r?.status()).toBe(404);
});
