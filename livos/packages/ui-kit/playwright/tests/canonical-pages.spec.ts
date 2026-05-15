import { test, expect, type Page } from '@playwright/test';

/**
 * Canonical-pages visual regression spec.
 *
 * Visits the 4 public Server5 routes that anchor v35.0 cross-surface parity
 * (livinity.io/login, /register, /store, /dashboard/install) plus the
 * canonical landing reference (dashboard.html) and captures snapshots in
 * 3 themes each.
 *
 * Requires live Server5 reachability — SKIPPED in CI by default. Run
 * locally via `pnpm playwright:test --grep canonical` to regress-test
 * the live cross-surface visual contract.
 *
 * To enable in CI, set `RUN_CANONICAL=1` (e.g. on a nightly schedule that
 * tolerates a live external HTTP fetch).
 */

const SHOULD_SKIP = !!process.env.CI && !process.env.RUN_CANONICAL;

const ROUTES = [
  { name: 'login', url: 'https://livinity.io/login' },
  { name: 'register', url: 'https://livinity.io/register' },
  { name: 'store', url: 'https://livinity.io/store' },
  { name: 'dashboard-install', url: 'https://livinity.io/dashboard/install' },
  { name: 'landing-dashboard', url: 'https://livinity.io/dashboard' },
] as const;

const THEMES = ['light', 'dark', 'iridescent'] as const;

async function applyTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.evaluate((t) => {
    document.body.classList.remove('light', 'dark', 'iridescent');
    if (t !== 'light') {
      document.body.classList.add(t);
    }
    try {
      window.localStorage.setItem('liv_theme', t);
    } catch {
      // sandboxed iframe — ignore
    }
  }, theme);
  await page.waitForTimeout(400);
}

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`canonical: ${route.name} / ${theme}`, async ({ page }) => {
      test.skip(SHOULD_SKIP, 'canonical-pages requires live Server5 (set RUN_CANONICAL=1 to enable in CI)');
      await page.goto(route.url, { waitUntil: 'networkidle' });
      await applyTheme(page, theme);
      // Reload once after theme is set to ensure SSR/CSR theme-class is applied at paint.
      await page.reload({ waitUntil: 'networkidle' });
      await applyTheme(page, theme);
      await expect(page).toHaveScreenshot(`${route.name}-${theme}.png`, {
        fullPage: true,
      });
    });
  }
}
