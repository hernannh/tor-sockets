import { expect, test } from '@playwright/test';

/**
 * REST API v1 contract tests. Assert response shapes (validated server-side by
 * zod) rather than exact values - stable across data volumes. Uses Playwright's
 * APIRequestContext (no browser) for speed.
 */

test.describe('API v1', () => {
  test('GET /api/v1/stats - network aggregates', async ({ request }) => {
    const res = await request.get('/api/v1/stats');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const key of [
      'relays_total',
      'relays_running',
      'relays_stopped',
      'consensus_weight_sum',
      'countries',
      'autonomous_systems',
      'hosters',
      'last_consensus',
      'computed_at',
    ]) {
      expect(body).toHaveProperty(key);
    }
    expect(typeof body.relays_total).toBe('number');
    expect(body.relays_total).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/v1/relays - paginated relay list', async ({ request }) => {
    const res = await request.get('/api/v1/relays?limit=5');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.relays)).toBeTruthy();
    // limit is respected when there's enough data
    expect(body.relays.length).toBeLessThanOrEqual(5);
    if (body.relays.length > 0) {
      const r = body.relays[0];
      expect(typeof r.fingerprint).toBe('string');
      expect(typeof r.nickname).toBe('string');
      expect(typeof r.running).toBe('boolean');
    }
  });

  test('GET /api/v1/relays?running=false filters stopped relays', async ({ request }) => {
    const res = await request.get('/api/v1/relays?limit=5&running=false');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.relays.every((r: { running: boolean }) => r.running === false)).toBeTruthy();
  });

  test('GET /api/v1/concentration - latest snapshot per dimension', async ({ request }) => {
    const res = await request.get('/api/v1/concentration?dimension=country&limit=3');
    // 200 with a snapshot, or 404 when none exist yet (fresh DB) - both valid.
    expect([200, 404]).toContain(res.status());
    if (res.ok()) {
      const body = await res.json();
      expect(body.dimension).toBe('country');
      expect(typeof body.hhi).toBe('number');
      expect(Array.isArray(body.keys)).toBeTruthy();
    }
  });

  test('GET /api/v1/openapi.json - valid OpenAPI 3.x document', async ({ request }) => {
    const res = await request.get('/api/v1/openapi.json');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.info.title).toBeTruthy();
    expect(body.paths).toBeTruthy();
    // Core paths are documented (without the /api/v1 prefix - that's in `servers`).
    for (const path of ['/stats', '/relays', '/relays/{fingerprint}', '/concentration']) {
      expect(body.paths).toHaveProperty(path);
    }
  });

  test('GET /api/v1/relays/export.csv - CSV export', async ({ request }) => {
    const res = await request.get('/api/v1/relays/export.csv');
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('text/csv');
    const text = await res.text();
    const lines = text.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    // Header row always present; data rows only when DB has relays.
    expect(lines[0]).toMatch(/fingerprint|nickname/i);
  });

  test('GET /api/v1/relays/{fingerprint} - detail or 404', async ({ request }) => {
    const bogus = '0'.repeat(40);
    const res = await request.get(`/api/v1/relays/${bogus}`);
    expect([404, 200]).toContain(res.status());
  });
});
