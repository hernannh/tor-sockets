import type { MetadataRoute } from 'next';

const BASE = (process.env.TOR_SOCKETS_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * The API is documented and open, but it is not what should rank: a crawler
 * walking `/api/v1/*` burns the rate limiter (per-class limits live in
 * `proxy.ts`) and indexes JSON instead of the pages that explain it. `/api/docs`
 * stays crawlable because it IS a page. Auth and operator surfaces are excluded
 * outright - they are per-user and behind a session.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/docs'],
        disallow: ['/api/v1/', '/api/auth/', '/federation/', '/login', '/signup', '/operator'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
