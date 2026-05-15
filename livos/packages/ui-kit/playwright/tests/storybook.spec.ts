import { test, expect, type Page } from '@playwright/test';

/**
 * Storybook visual regression spec.
 *
 * Iterates the 11 Phase 119 ui-kit stories × 3 themes (light, dark,
 * iridescent) = 33 snapshots. Each story is rendered in its dedicated
 * Storybook iframe; the spec sets `body.{theme}` class via localStorage +
 * direct className mutation, waits for paint, and captures a full-iframe
 * snapshot.
 *
 * The Storybook static build at `livos/packages/ui-kit/storybook-static/`
 * is served by the `webServer` block in `playwright.config.ts` on port 6006.
 */

// Story IDs follow Storybook's auto-derived naming convention.
// They match the file-name → kebab-case mapping in Phase 119 stories.
const STORIES = [
  'atoms-button--default',
  'atoms-card--default',
  'atoms-pill--default',
  'atoms-input--default',
  'atoms-passwordinput--default',
  'composites-stepper--default',
  'composites-commandbox--default',
  'composites-modal--default',
  'composites-toast--default',
  'composites-navbar--default',
  'composites-themetoggle--default',
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
      // ignore — Storybook iframe localStorage may be sandboxed in some CI envs
    }
  }, theme);
  // Allow CSS transitions (0.18s ease canonical) + font-face swap to settle.
  await page.waitForTimeout(300);
}

for (const story of STORIES) {
  for (const theme of THEMES) {
    test(`storybook: ${story} / ${theme}`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${story}&viewMode=story`, {
        waitUntil: 'networkidle',
      });
      await applyTheme(page, theme);
      await expect(page).toHaveScreenshot(`${story}-${theme}.png`, {
        fullPage: true,
      });
    });
  }
}
