import { expect, test } from '@playwright/test';

/**
 * Security-header contract.
 *
 * The CSP is minted per request in `proxy.ts` and comes in two flavours:
 * nonce + strict-dynamic on the routes Next renders dynamically, and a
 * compatible policy everywhere else (a prerendered page has no nonce, and
 * sending it strict-dynamic would block its own bundles - a blank screen).
 *
 * These tests are the drift guard: if a nonce route ever turns static, or a new
 * page is added to the nonce list without being dynamic, the assertion that
 * every script tag carries the nonce fails here instead of in production.
 *
 * Note: `next dev` deliberately relaxes script-src (Turbopack HMR needs eval),
 * so the strict assertions only run against a production build.
 */

const NONCE_ROUTES = ['/relays', '/families', '/correlation', '/trends', '/api/docs'];
const PLAIN_ROUTES = ['/', '/dashboard', '/health', '/login'];

/**
 * Dev vs production is detected from the policy itself rather than NODE_ENV:
 * the suite may run against a dev server (`pnpm dev`, the default webServer) or
 * a production build, and only the latter can be asserted strictly.
 */
function isDevPolicy(csp: string): boolean {
  return csp.includes("'unsafe-eval'");
}

test.describe('security headers', () => {
  test('every page carries the baseline hardening headers', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['permissions-policy']).toContain('geolocation=()');
    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test('the API refuses to be framed and declares its own CSP', async ({ request }) => {
    const res = await request.get('/api/v1/stats');
    expect(res.headers()['content-security-policy'] ?? '').toContain("frame-ancestors 'none'");
  });

  for (const route of NONCE_ROUTES) {
    test(`${route} nonces every script tag`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(200);
      const csp = res.headers()['content-security-policy'] ?? '';
      test.skip(isDevPolicy(csp), 'dev server relaxes script-src for HMR');
      const nonceMatch = /'nonce-([^']+)'/.exec(csp);
      expect(nonceMatch, `expected a nonce in the CSP of ${route}`).not.toBeNull();
      const nonce = nonceMatch?.[1];

      const html = await res.text();
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      expect(scripts.length, `${route} should render script tags`).toBeGreaterThan(0);
      for (const tag of scripts) {
        expect(tag, `script without the request nonce on ${route}: ${tag}`).toContain(
          `nonce="${nonce}"`,
        );
      }
    });
  }

  for (const route of PLAIN_ROUTES) {
    test(`${route} keeps a policy its prerendered scripts can satisfy`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(200);
      const csp = res.headers()['content-security-policy'] ?? '';
      test.skip(isDevPolicy(csp), 'dev server relaxes script-src for HMR');
      // No nonce here on purpose: a static page cannot carry one, so the policy
      // must not be strict-dynamic or the page ships without JavaScript.
      expect(csp).not.toContain('strict-dynamic');
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    });
  }
});
