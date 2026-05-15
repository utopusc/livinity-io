import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for @livinity/ui-kit visual regression suite.
 *
 * Phase 121-06 (v35.0 close-out plan) adds Playwright as the visual-regression
 * dependency to satisfy v35.0 acceptance criterion #6 (Visual Regression CI).
 *
 * Snapshot threshold: 0.5% pixel-diff ratio (per plan spec — strict enough
 * to catch real visual drift, loose enough to tolerate font-rendering /
 * GPU-driver differences between CI and dev environments).
 *
 * Storybook static is built by `pnpm --filter ui-kit storybook:build` and
 * served by `npx http-server storybook-static -p 6006` (configured in
 * `webServer` below).
 *
 * Canonical-pages tests (livinity.io/* production URLs) require live Server5
 * and are skipped in CI by default via `test.skip(!!process.env.CI, ...)` in
 * the spec — they run locally for ad-hoc regression checks.
 */
export default defineConfig({
  testDir: './playwright/tests',
  snapshotDir: './playwright/__snapshots__',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005, // 0.5% pixel-diff threshold per D-121 plan spec
    },
  },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npx http-server storybook-static -p 6006 --silent',
    port: 6006,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
