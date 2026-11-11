import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SAMPLE = 'public/samples/dog.jpg';

test.describe('public pages', () => {
  test('the home page presents the tool, in English and in French', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FreeRemoveBg/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Remove image backgrounds');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://freeremovebg.mbonnici.fr/');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(3);

    await page.getByRole('button', { name: 'Français' }).first().click();
    await expect(page).toHaveURL(/\/fr$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Supprimez le fond');
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
    expect(await (await request.get('/fr/index.md')).text()).toContain('# FreeRemoveBg — ');
  });
});

test.describe('the tool', () => {
  test('removes a background, changes it and downloads the result', async ({ page }) => {
    // The processor: headless browsers have no graphics card.
    await page.goto('/app?device=wasm');
    await page.locator('app-dropzone input[type=file]').setInputFiles(SAMPLE);
    await expect(page.locator('p[role=status]').first()).toHaveText('Background removed', { timeout: 280_000 });
    await expect(page.locator('.meta')).toContainText('960 × 1200 px');

    // The cutout is transparent somewhere and opaque somewhere else.
    const alpha = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
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
    await page.getByRole('button', { name: '#ef4444' }).click();
    const corner = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(2, 2, 1, 1).data));
    expect(corner).toEqual([239, 68, 68, 255]);

    await page.getByRole('button', { name: 'JPG', exact: true }).click();
    const [jpg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
    expect(jpg.suggestedFilename()).toBe('dog-no-bg.jpg');

    // The brush: erasing in the middle of the picture can be undone.
    await page.getByRole('button', { name: 'None', exact: true }).click();
    await page.getByRole('button', { name: 'Erase', exact: true }).click();
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();

    // A second picture makes it a batch, downloaded as one archive.
    await page.locator('input[type=file]').first().setInputFiles('public/samples/plant.jpg');
    await expect(page.getByRole('button', { name: /^plant\.jpg — background removed/ })).toBeVisible({ timeout: 120_000 });
    const [archive] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download all as ZIP (2)' }).click()]);
    expect(archive.suggestedFilename()).toBe('freeremovebg.zip');
    expect(readFileSync(await archive.path()).subarray(0, 2).toString()).toBe('PK');
  });
});
