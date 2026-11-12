import { readFileSync } from 'node:fs';
import { type Page, devices, expect, test } from '@playwright/test';

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
    await page.getByRole('tab', { name: /ORMBG/ }).click();
    await expect(page.locator('#spec-sheet')).toContainText('Open Remove Background Model');
    await expect(page.locator('#spec-sheet .qr img')).toHaveAttribute('src', '/qr/ormbg.svg');
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

  test('the install button is there from the start and explains the steps', async ({ page }) => {
    await page.goto('/');
    const install = page.getByRole('button', { name: 'Install the app' }).first();
    await expect(install).toBeVisible();
    // No install prompt from the browser yet: the steps for this browser (Chrome) are shown.
    await install.click();
    const help = page.getByRole('dialog', { name: 'Install FreeRemoveBg' });
    await expect(help).toBeVisible();
    await expect(help.locator('li')).toHaveCount(2);
    await expect(help).toContainText('address bar');
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
    expect((await page.request.get(manifest.icons.at(-1).src)).ok()).toBe(true);
  });

  test('search engines and assistants get their files', async ({ request }) => {
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://freeremovebg.mbonnici.fr/sitemap.xml');
    expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://freeremovebg.mbonnici.fr/fr/privacy</loc>');
    expect(await (await request.get('/llms.txt')).text()).toContain('# FreeRemoveBg');
    expect(await (await request.get('/fr/index.md')).text()).toContain('IS-Net');
  });
});

test.describe('the tool', () => {
  test('warns phone users that cutouts are slower, until they close the notice', async ({ browser }) => {
    const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US' });
    const page = await phone.newPage();
    await page.goto('/app');
    const notice = page.getByRole('note').filter({ hasText: 'On a phone, cutouts are slower' });
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Close' }).click();
    await expect(notice).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'First, choose the AI model' })).toBeVisible();
    await expect(notice).toBeHidden();
    await phone.close();
  });

  test('asks before downloading the model, then prepares, cuts out and exports', async ({ page }) => {
    // Three models are downloaded in a fresh browser, and run on the processor.
    test.setTimeout(600_000);
    const toHub: string[] = [];
    page.on('request', (r) => {
      if (/huggingface\.co|hf\.co/.test(r.url())) toHub.push(r.url());
    });

    // Step 1: nothing is downloaded before the user agrees. The processor: headless browsers have no graphics card.
    await page.goto('/app?device=wasm');
    await expect(page.getByRole('heading', { name: 'First, choose the AI model' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /IS-Net/ })).toBeChecked();
    await page.waitForTimeout(1500);
    expect(toHub).toEqual([]);
    await page.getByRole('button', { name: /^Download IS-Net/ }).click();
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
    const canvas = page.locator('.viewport canvas:not(.overlay)');
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

    // Zoom with the mouse wheel: choosing a brush and painting keep it.
    const zoomValue = page.locator('.zoom-value');
    await expect(zoomValue).toHaveText('100 %');
    const view = (await page.locator('.viewport').boundingBox())!;
    await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
    await page.mouse.wheel(0, -400);
    await expect(zoomValue).not.toHaveText('100 %');
    const zoomed = await zoomValue.textContent();
    await page.getByRole('tab', { name: 'Retouch' }).click();
    await expect(page.locator('#brush')).toHaveCount(0);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.locator('#brush')).toBeVisible();
    // Choosing the tool may have scrolled the page: where the picture is now.
    await page.locator('.viewport').scrollIntoViewIfNeeded();
    const now = (await page.locator('.viewport').boundingBox())!;
    await page.mouse.move(now.x + now.width * 0.4, now.y + now.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(now.x + now.width * 0.6, now.y + now.height * 0.5, { steps: 5 });
    await page.mouse.up();
    await expect(zoomValue).toHaveText(zoomed!);
    await page.getByRole('button', { name: 'Undo' }).click();
    await zoomValue.click();
    await expect(zoomValue).toHaveText('100 %');

    // The brush: erasing across the picture can be undone and redone.
    await page.getByRole('button', { name: 'Erase', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
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
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    // Click (SAM 2.1): asked for first, then a box around the dog is added as one undoable step.
    await page.getByRole('button', { name: 'Click', exact: true }).click();
    await page.waitForTimeout(1000);
    expect(toHub.some((url) => url.includes('sam2'))).toBe(false);
    await page.getByRole('button', { name: /^Download SAM 2\.1/ }).click();
    await expect(page.getByText('Click on the object, or draw a box')).toBeVisible({ timeout: 280_000 });
    expect(toHub.some((url) => url.includes('sam2'))).toBe(true);
    await canvas.scrollIntoViewIfNeeded();
    const area = (await canvas.boundingBox())!;
    await page.mouse.move(area.x + area.width * 0.1, area.y + area.height * 0.05);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.9, area.y + area.height * 0.97, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Add to the cutout' }).click({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Add to the cutout' })).toBeHidden();

    // Lasso: a square in the empty top-left corner, point by point; Ctrl + Z takes the last point
    // back while drawing, then undoes the restored area once it is applied.
    await page.getByRole('button', { name: 'Lasso', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const pic = (await canvas.boundingBox())!;
    const click = (fx: number, fy: number) => page.mouse.click(pic.x + pic.width * fx, pic.y + pic.height * fy);
    const cornerAlpha = () =>
      canvas.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(Math.round(c.width * 0.055), Math.round(c.height * 0.04), 1, 1).data[3]);
    const state = page.locator('.lasso-state');
    expect(await cornerAlpha()).toBeLessThan(10);
    await click(0.02, 0.02);
    await click(0.09, 0.02);
    await click(0.05, 0.4);
    await expect(state).toContainText('3 points');
    await page.keyboard.press('Control+z');
    await expect(state).toContainText('2 points');
    await click(0.09, 0.06);
    await click(0.02, 0.06);
    await click(0.02, 0.02);
    await expect(state).toContainText('Shape closed (4 points)');
    await page.getByRole('button', { name: 'Restore', exact: true }).last().click();
    await expect.poll(cornerAlpha).toBeGreaterThan(245);
    await page.keyboard.press('Control+z');
    await expect.poll(cornerAlpha).toBeLessThan(10);
    await page.keyboard.press('Control+y');
    await expect.poll(cornerAlpha).toBeGreaterThan(245);

    // Compare with the other model: it is asked for first, then the picture is cut out again.
    await expect(page.getByText('Cut out with')).toContainText('IS-Net');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Try ORMBG' }).click();
    await expect(page.getByRole('radio', { name: /ORMBG/ })).toBeChecked();
    await page.getByRole('button', { name: /^Download ORMBG/ }).click();
    await page.getByRole('button', { name: 'Continue to my pictures' }).click({ timeout: 10_000 }).catch(() => undefined);
    await expect(page.locator('p[role=status]').first()).toHaveText('Background removed', { timeout: 280_000 });
    await expect(page.getByText('Cut out with')).toContainText('ORMBG');

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

  test('cuts out several subjects zone by zone, splits them into pictures, and goes back through the steps', async ({ page }) => {
    test.setTimeout(400_000);
    page.on('dialog', (d) => d.accept());
    await page.goto('/app?device=wasm');
    await page.getByRole('button', { name: /^Download IS-Net/ }).click();
    await page.getByRole('button', { name: 'Continue to my pictures' }).click({ timeout: 10_000 }).catch(() => undefined);
    await page.locator('app-dropzone input[type=file]').setInputFiles('public/samples/dogs.jpg');

    // Zones: one around the husky, one around the Australian shepherd.
    await page.getByRole('button', { name: 'Zones', exact: true }).click();
    const box = (await page.locator('app-prepare-view canvas').boundingBox())!;
    const draw = async (x1: number, y1: number, x2: number, y2: number) => {
      await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 5 });
      await page.mouse.up();
    };
    const count = page.locator('.zone-count');
    await draw(0.26, 0.33, 0.44, 0.77);
    await draw(0.63, 0.39, 0.86, 0.92);
    await expect(count).toHaveText('Zones: 2');
    // A drag that starts inside a zone draws another one: subjects side by side overlap.
    await draw(0.3, 0.4, 0.4, 0.7);
    await expect(count).toHaveText('Zones: 3');
    await page.getByRole('button', { name: 'Remove zone 3' }).click();
    await expect(count).toHaveText('Zones: 2');
    // With the keyboard: a zone is added, gets the focus, moves, and is removed.
    await page.getByRole('button', { name: 'Add a zone' }).click();
    await expect(page.locator('[data-zone="2"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');
    await expect(count).toHaveText('Zones: 2');

    // Together on the whole picture: nothing outside the zones, the dogs inside.
    await page.getByRole('button', { name: 'Cut out the zones on this picture' }).click();
    await expect(page.locator('p[role=status]').first()).toHaveText('Background removed', { timeout: 280_000 });
    await expect(page.locator('.meta')).toContainText('1440 × 961 px');
    const canvas = page.locator('.viewport canvas:not(.overlay)');
    const alpha = (fx: number, fy: number) =>
      canvas.evaluate((c: HTMLCanvasElement, [x, y]: number[]) => c.getContext('2d')!.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data[3], [fx, fy]);
    expect(await alpha(0.05, 0.3)).toBe(0);
    expect(await alpha(0.75, 0.72)).toBeGreaterThan(200);

    // Back to "Prepare" from the steps at the top: the zones are still there; one picture each.
    await page.locator('.stepper li').nth(2).getByRole('button').click();
    await page.getByRole('button', { name: 'Zones', exact: true }).click();
    await expect(count).toHaveText('Zones: 2');
    await page.getByRole('button', { name: /^Split into 2 pictures/ }).click();
    await expect(page.getByRole('button', { name: /^dogs \(1\)\.jpg — to prepare/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^dogs \(2\)\.jpg — to prepare/ })).toBeVisible();

    // Step 2 lists the pictures already added; step 1 shows the model, then leads back.
    await page.locator('.stepper li').nth(1).getByRole('button').click();
    await expect(page.getByText('Your pictures (2)')).toBeVisible();
    await page.getByRole('button', { name: 'Back to my pictures' }).click();
    await expect(page.getByRole('heading', { name: 'Prepare the picture?' })).toBeVisible();
    await page.locator('.stepper li').nth(0).getByRole('button').click();
    await page.getByRole('button', { name: 'Continue with IS-Net' }).click();
    await expect(page.getByRole('heading', { name: 'Prepare the picture?' })).toBeVisible();
  });
});
