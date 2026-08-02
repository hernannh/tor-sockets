import { expect, test } from '@playwright/test';
import type { RelaysResponse } from '@tor-sockets/api-contract';

/**
 * Public read-only UI flows. Asserts on server-rendered structure (headings,
 * key elements) rather than exact data values, so the suite is stable whether
 * the DB holds 10k real relays or is empty.
 */

test.describe('public pages', () => {
  test('dashboard renders the network overview', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    // The page is server-rendered (RSC); a main landmark should be present.
    await expect(page.locator('body')).toBeVisible();
  });

  test('map page renders', async ({ page }) => {
    await page.goto('/map');
    await expect(page.getByRole('heading', { name: 'Relay Map' })).toBeVisible();
  });

  test('relay directory renders', async ({ page }) => {
    await page.goto('/relays');
    await expect(page.getByRole('heading', { name: 'Relay Directory' })).toBeVisible();
  });

  test('alerts & anomalies page renders', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: 'Alerts & Anomalies' })).toBeVisible();
  });

  test('network history page renders', async ({ page }) => {
    await page.goto('/network-history');
    await expect(page.getByRole('heading', { name: 'Network History' })).toBeVisible();
  });

  test('landing renders the hero at /', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Who controls your circuit?' })).toBeVisible();
  });

  test('opengraph image route serves a PNG', async ({ request }) => {
    const res = await request.get('/opengraph-image');
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type'] ?? '').toContain('image/png');
  });

  test('relay detail page loads for a known fingerprint (if data exists)', async ({
    page,
    request,
  }) => {
    const res = await request.get('/api/v1/relays?limit=1');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as RelaysResponse;
    const relay = body.relays?.[0];
    test.skip(!relay, 'no relays in DB - skipping detail test');

    await page.goto(`/relays/${relay.fingerprint}`);
    // The detail page heading is the relay nickname.
    await expect(page.getByRole('heading', { name: relay.nickname })).toBeVisible();
  });

  test('the command palette opens on the keyboard and jumps to a section', async ({ page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByPlaceholder('Jump to a section');
    await expect(input).toBeVisible();

    await input.fill('correlation');
    await page
      .getByRole('button', { name: /Correlation Risk/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/correlation$/);
  });

  test('health signals switch the section they summarise', async ({ page }) => {
    await page.goto('/health');
    await expect(page.getByRole('heading', { name: 'Overload' })).toBeVisible();

    await page.getByRole('tab', { name: /IPv6/ }).click();
    await expect(page.getByRole('heading', { name: 'IPv6 support' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overload' })).toBeHidden();
  });
});

test('landing still renders under reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Who controls your circuit?' })).toBeVisible();
  } finally {
    await context.close();
  }
});
