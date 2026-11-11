// Takes the screenshots of the README (docs/screenshots) from a running build, with the sample
// pictures. Usage: npm run screenshots [-- http://localhost:4281]
// Uses the installed Chrome, so the AI runs on the graphics card when there is one.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:4281';
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });

async function open(path, { width = 1440, height = 900, colorScheme = 'light', locale = 'en-US', mobile = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme, locale, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  return page;
}

const shot = (target, name) => target.screenshot({ path: `${OUT}/${name}.png` });

/** Drops the samples and waits until every background is removed. */
async function load(page, ...ids) {
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(ids.map((id) => `public/samples/${id}.jpg`));
  for (const id of ids) await page.getByRole('button', { name: new RegExp(`^${id}\\.jpg — (background removed|fond supprimé)`) }).waitFor({ timeout: 300_000 });
  await page.waitForTimeout(500);
}

// --- Home page -----------------------------------------------------------------------------
let page = await open('/');
await shot(page, 'landing-light');
for (const [selector, name] of [
  ['#features', 'features'],
  ['.table-wrap', 'compare'],
  ['.showcase-section', 'backgrounds'],
]) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page.locator(selector), name);
}
await page.context().close();

page = await open('/fr', { colorScheme: 'dark', locale: 'fr-FR' });
await shot(page, 'landing-dark');
await page.context().close();

// --- The tool ------------------------------------------------------------------------------
page = await open('/app');
await load(page, 'dog', 'cat', 'plant');
await page.getByRole('button', { name: /^cat\.jpg/ }).click();
await page.waitForTimeout(400);
await shot(page, 'editor');

await page.getByRole('button', { name: 'Gradient', exact: true }).click();
await page.getByRole('button', { name: 'Gradient 3' }).click();
await page.waitForTimeout(300);
await shot(page, 'editor-background');

await page.getByRole('button', { name: /^dog\.jpg/ }).click();
await page.getByRole('button', { name: 'Blur', exact: true }).click();
await page.waitForTimeout(400);
await shot(page, 'editor-blur');

// The eraser at work: a stroke across the plant, zoomed in.
await page.getByRole('button', { name: /^plant\.jpg/ }).click();
await page.getByRole('button', { name: 'None', exact: true }).click();
await page.getByRole('button', { name: 'Zoom in' }).click();
await page.getByRole('button', { name: 'Erase', exact: true }).click();
const box = await page.locator('.viewport').boundingBox();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.6, { steps: 12 });
await page.mouse.up();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
await page.waitForTimeout(300);
await shot(page, 'editor-brush');
await page.context().close();

page = await open('/app', { colorScheme: 'dark' });
await load(page, 'cat');
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
await load(page, 'dog');
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
