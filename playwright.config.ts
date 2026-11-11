import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the key flows, against a running build:
 *   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
 *   npm run test:e2e
 * E2E_BASE_URL points them elsewhere (http://localhost:4200 with `npm start`).
 * The first test that removes a background downloads the AI model (179 MB).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4281',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
