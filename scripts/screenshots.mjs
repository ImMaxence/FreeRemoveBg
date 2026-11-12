// Takes the screenshots of the README (docs/screenshots) from a running build, with the sample
// pictures. Usage: npm run screenshots [-- http://localhost:4281]
// Uses the installed Chrome, so the AI runs on the graphics card when there is one.
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:4281';
const OUT = 'docs/screenshots';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });

async function open(path, { width = 1440, height = 900, colorScheme = 'light', locale = 'en-US', mobile = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme, locale, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  return page;
}

const shot = (target, name) => target.screenshot({ path: `${OUT}/${name}.png` });

/** Scrolls a section under the floating header, lets its pictures load, then takes the viewport. */
async function section(page, selector, name) {
  await page.locator(selector).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -100));
  await page.waitForTimeout(800);
  await shot(page, name);
}

/** Through the model step (a fresh browser does not have the model yet). */
async function agree(page, label = /^Download IS-Net/, next = 'Continue to my pictures') {
  const button = page.getByRole('button', { name: label });
  if (await button.waitFor({ timeout: 10_000 }).then(() => true, () => false)) {
    await button.click();
    await page.getByRole('button', { name: next }).click({ timeout: 20_000 }).catch(() => undefined);
  }
}

/** Drops samples, cuts them all out, and waits for every result. */
async function cutOut(page, ...ids) {
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(ids.map((id) => `public/samples/${id}.jpg`));
  await page.getByRole('button', { name: /^Cut out (this picture|all)/ }).last().click();
  for (const id of ids) await page.getByRole('button', { name: new RegExp(`^${id}\\.jpg — background removed`) }).waitFor({ timeout: 300_000 });
  await page.waitForTimeout(600);
}

// --- Home page -----------------------------------------------------------------------------
let page = await open('/');
await shot(page, 'landing-light');
// The install help, before the browser offers its own prompt.
await page.getByRole('button', { name: 'Install the app' }).first().click();
await page.getByRole('dialog').waitFor();
await page.waitForTimeout(400);
await shot(page, 'install-help');
await page.keyboard.press('Escape');
// The focus goes back to the install button: without it, its ring stays in the next screenshots.
await page.evaluate(() => document.activeElement?.blur());
await section(page, '#lasso .spot-card', 'landing-lasso');
await section(page, '#ai', 'landing-ai');
await section(page, '#how', 'landing-steps');
await section(page, '#features', 'landing-features');
await section(page, '#privacy', 'landing-privacy');
await page.context().close();

page = await open('/fr', { colorScheme: 'dark', locale: 'fr-FR' });
await shot(page, 'landing-dark');
await page.context().close();

// --- The tool, step by step ------------------------------------------------------------------
page = await open('/app');
await page.getByRole('button', { name: /^Download IS-Net/ }).waitFor({ timeout: 10_000 });
await shot(page, 'step-1-model');
await agree(page);
await page.getByRole('button', { name: 'Choose pictures' }).waitFor({ timeout: 60_000 });
await shot(page, 'step-2-pictures');
await page.locator('app-dropzone input[type=file]').setInputFiles('public/samples/hero.jpg');
await page.getByRole('button', { name: 'Crop', exact: true }).click();
await page.getByRole('button', { name: '4:5', exact: true }).click();
await page.waitForTimeout(400);
await shot(page, 'step-3-prepare');
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.getByRole('button', { name: 'Cut out this picture' }).click();
await page.locator('p[role=status]').filter({ hasText: 'Background removed' }).waitFor({ timeout: 300_000 });
await page.waitForTimeout(500);
await shot(page, 'step-4-result');
await cutOut(page, 'cat', 'plant');
await page.getByRole('button', { name: /^cat\.jpg/ }).click();
await page.getByRole('button', { name: 'Gradient', exact: true }).click();
await page.getByRole('button', { name: 'Gradient 3' }).click();
await page.waitForTimeout(400);
await shot(page, 'editor-background');
await page.getByRole('button', { name: /^hero\.jpg/ }).click();
await page.getByRole('button', { name: 'Blur', exact: true }).click();
await page.waitForTimeout(400);
await shot(page, 'editor-blur');
// The rescue tool: an area drawn around the plant's leaves.
await page.getByRole('button', { name: /^plant\.jpg/ }).click();
await page.getByRole('button', { name: 'None', exact: true }).click();
await page.getByRole('tab', { name: 'Retouch' }).click();
await page.getByRole('button', { name: 'Rescue', exact: true }).click();
const frame = await page.locator('.viewport canvas:not(.overlay)').boundingBox();
await page.mouse.move(frame.x + frame.width * 0.12, frame.y + frame.height * 0.2);
await page.mouse.down();
await page.mouse.move(frame.x + frame.width * 0.7, frame.y + frame.height * 0.62, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
await shot(page, 'editor-rescue');
// The Click tool: SAM 2.1 outlines what a box is drawn around.
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.getByRole('button', { name: 'Click', exact: true }).click();
await page.getByRole('button', { name: /^Download SAM 2\.1/ }).click();
await page.getByText('Click on the object, or draw a box').waitFor({ timeout: 300_000 });
const area = await page.locator('.viewport canvas:not(.overlay)').boundingBox();
await page.mouse.move(area.x + area.width * 0.18, area.y + area.height * 0.08);
await page.mouse.down();
await page.mouse.move(area.x + area.width * 0.84, area.y + area.height * 0.96, { steps: 8 });
await page.mouse.up();
await page.getByRole('button', { name: 'Add to the cutout' }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(400);
await shot(page, 'editor-click');
// The lasso: points around the grass left at the cat's feet, the shape closed on the first one.
await page.getByRole('button', { name: /^cat\.jpg/ }).click();
await page.getByRole('tab', { name: 'Retouch' }).click();
await page.getByRole('button', { name: 'Lasso', exact: true }).click();
const cat = await page.locator('.viewport canvas:not(.overlay)').boundingBox();
for (const [x, y] of [[292, 418], [297, 442], [262, 505], [222, 594], [170, 594], [174, 556], [240, 470], [292, 418]]) {
  await page.mouse.click(cat.x + (cat.width * x) / 480, cat.y + (cat.height * y) / 600);
}
await page.waitForTimeout(400);
await shot(page, 'editor-lasso');
await page.context().close();

page = await open('/app', { colorScheme: 'dark' });
await agree(page);
await cutOut(page, 'cat');
await shot(page, 'editor-dark');
await page.context().close();

// --- Phone ---------------------------------------------------------------------------------
page = await open('/', { width: 390, height: 844, mobile: true });
await shot(page, 'mobile-landing');
await page.getByRole('button', { name: 'Open the menu' }).click();
await page.waitForTimeout(400);
await shot(page, 'mobile-menu');
await page.context().close();

page = await open('/app', { width: 390, height: 844, mobile: true });
await agree(page);
await cutOut(page, 'dog');
await shot(page, 'mobile-editor');
await page.context().close();

// --- Other pages ---------------------------------------------------------------------------
page = await open('/privacy');
await shot(page, 'privacy');
await page.goto(`${BASE}/changelog`, { waitUntil: 'networkidle' });
await shot(page, 'changelog');
await page.context().close();

await browser.close();
console.log(`screenshots written to ${OUT}`);
