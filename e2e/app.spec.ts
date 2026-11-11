import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

const SAMPLE = 'public/samples/dog.jpg';

/** Size shown above the picture being prepared: "960 × 1200 px" → [960, 1200]. */
async function preparedSize(page: Page): Promise<number[]> {
  const text = (await page.locator('.stage-head .size').textContent()) ?? '';
  return text.match(/\d+/g)!.map(Number);
}

test.describe('public pages', () => {
  test('the home page presents the tool and its AI, in English and in French', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FreeRemoveBg/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cut out any picture');
    await expect(page.locator('#ai')).toContainText('IS-Net');
    await expect(page.locator('#ai')).toContainText('ECCV 2022');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://freeremovebg.mbonnici.fr/');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(3);

    await page.getByRole('button', { name: 'Français' }).first().click();
    await expect(page).toHaveURL(/\/fr$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Détourez vos images');
  });

  test('the first Tab stop skips to the content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  for (const [path, title] of [
    ['/legal', 'Legal notice'],
    ['/privacy', 'Privacy policy'],
    ['/terms', 'Terms of use'],
    ['/accessibility', 'Accessibility statement'],
    ['/changelog', 'Changelog'],
  ]) {
    test(`${path} is served prerendered`, async ({ page, request }) => {
      const html = await (await request.get(path)).text();
      expect(html).toContain(`<h1`);
      expect(html).toContain(title);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    });
  }

  test('search engines and assistants get their files', async ({ request }) => {
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://freeremovebg.mbonnici.fr/sitemap.xml');
    expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://freeremovebg.mbonnici.fr/fr/privacy</loc>');
    expect(await (await request.get('/llms.txt')).text()).toContain('# FreeRemoveBg');
    expect(await (await request.get('/fr/index.md')).text()).toContain('IS-Net');
  });
});

test.describe('the tool', () => {
  test('asks before downloading the model, then prepares, cuts out and exports', async ({ page }) => {
    const toHub: string[] = [];
    page.on('request', (r) => {
      if (/huggingface\.co|hf\.co/.test(r.url())) toHub.push(r.url());
    });

    // Step 1: nothing is downloaded before the user agrees. The processor: headless browsers have no graphics card.
    await page.goto('/app?device=wasm');
    await expect(page.getByRole('heading', { name: 'First, the AI model' })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(toHub).toEqual([]);
    await page.getByRole('button', { name: /Download the model/ }).click();
    await page.getByRole('button', { name: 'Continue to my pictures' }).click({ timeout: 10_000 }).catch(() => undefined);
    expect(toHub.length).toBeGreaterThan(0);

    // Step 2, then 3: the picture waits, untouched, to be prepared.
    await page.locator('app-dropzone input[type=file]').setInputFiles(SAMPLE);
    await expect(page.getByRole('heading', { name: 'Prepare the picture?' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^dog\.jpg — to prepare/ })).toBeVisible();
    expect(await preparedSize(page)).toEqual([960, 1200]);

    // Turning, cropping, and coming back to the original.
    await page.getByRole('button', { name: 'Turn right' }).click();
    await expect.poll(() => preparedSize(page)).toEqual([1200, 960]);
    await page.getByRole('button', { name: 'Back to the original picture' }).click();
    await expect.poll(() => preparedSize(page)).toEqual([960, 1200]);
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    await page.getByRole('button', { name: 'Square', exact: true }).click();
    await page.getByRole('button', { name: 'Apply the crop' }).click();
    await expect.poll(async () => new Set(await preparedSize(page)).size).toBe(1);
    await page.getByRole('button', { name: 'Back to the original picture' }).click();
    await expect.poll(() => preparedSize(page)).toEqual([960, 1200]);

    // Step 4: the cutout.
    await page.getByRole('button', { name: 'Cut out this picture' }).click();
    await expect(page.locator('p[role=status]').first()).toHaveText('Background removed', { timeout: 280_000 });
    await expect(page.locator('.meta')).toContainText('960 × 1200 px');

    // The cutout is transparent somewhere and opaque somewhere else.
    const canvas = page.locator('.viewport canvas');
    const alpha = await canvas.evaluate((c: HTMLCanvasElement) => {
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      let transparent = 0;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) data[i] < 8 ? transparent++ : data[i] > 247 ? opaque++ : 0;
      return { transparent: transparent / (data.length / 4), opaque: opaque / (data.length / 4) };
    });
    expect(alpha.transparent).toBeGreaterThan(0.5);
    expect(alpha.opaque).toBeGreaterThan(0.02);

    const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
    expect(png.suggestedFilename()).toBe('dog-no-bg.png');
    expect(readFileSync(await png.path()).subarray(1, 4).toString()).toBe('PNG');

    // A color behind the subject: nothing is transparent any more.
    await page.getByRole('button', { name: 'Color', exact: true }).click();
    await page.getByRole('button', { name: '#ff6b4a' }).click();
    const corner = await canvas.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(2, 2, 1, 1).data));
    expect(corner).toEqual([255, 107, 74, 255]);
    await page.getByRole('button', { name: 'JPG', exact: true }).click();
    const [jpg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
    expect(jpg.suggestedFilename()).toBe('dog-no-bg.jpg');
    await page.getByRole('button', { name: 'None', exact: true }).click();

    // The brush: erasing across the picture can be undone and redone.
    await page.getByRole('tab', { name: 'Retouch' }).click();
    await page.getByRole('button', { name: 'Erase', exact: true }).click();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();

    // Rescue: the AI looks again at a drawn area, undoable like a stroke.
    await page.getByRole('button', { name: 'Rescue', exact: true }).click();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.95, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Rescue this area' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled({ timeout: 120_000 });
    await expect(page.locator('p[role=status]').first()).toHaveText('Background removed');

    // A second picture opens in "Prepare"; both download as one archive.
    await page.locator('input[type=file]').first().setInputFiles('public/samples/plant.jpg');
    await expect(page.getByRole('heading', { name: 'Prepare the picture?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cut out this picture' }).click();
    await expect(page.getByRole('button', { name: /^plant\.jpg — background removed/ })).toBeVisible({ timeout: 120_000 });
    const [archive] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'All as ZIP (2)' }).click()]);
    expect(archive.suggestedFilename()).toBe('freeremovebg.zip');
    expect(readFileSync(await archive.path()).subarray(0, 2).toString()).toBe('PK');

    // Going back to "Prepare" drops the cutout, after a confirmation.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Back to preparing' }).click();
    await expect(page.getByRole('heading', { name: 'Prepare the picture?' })).toBeVisible();
  });
});
