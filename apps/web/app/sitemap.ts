import type { MetadataRoute } from 'next';

const BASE = (process.env.TOR_SOCKETS_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * Sitemap of the section pages only.
 *
 * Relay and family detail pages are deliberately left out: there are ~10k
 * relays whose rows change every consensus, so listing them would be a large,
 * permanently stale sitemap of thin pages. They stay reachable - and crawlable -
 * through `/relays` and `/families`.
 */
const ROUTES: Array<{ path: string; priority: number; changeFrequency: 'hourly' | 'daily' }> = [
  { path: '/', priority: 1, changeFrequency: 'hourly' },
  { path: '/dashboard', priority: 0.9, changeFrequency: 'hourly' },
  { path: '/health', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/trends', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/network-history', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/correlation', priority: 0.7, changeFrequency: 'hourly' },
  { path: '/hidden-families', priority: 0.7, changeFrequency: 'hourly' },
  { path: '/families', priority: 0.7, changeFrequency: 'hourly' },
  { path: '/map', priority: 0.7, changeFrequency: 'hourly' },
  { path: '/versions', priority: 0.6, changeFrequency: 'daily' },
  { path: '/alerts', priority: 0.6, changeFrequency: 'hourly' },
  { path: '/relays', priority: 0.6, changeFrequency: 'hourly' },
  { path: '/api/docs', priority: 0.5, changeFrequency: 'daily' },
];

// Rebuild hourly, in step with the consensus cycle that changes every page.
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((r) => ({
    url: `${BASE}${r.path === '/' ? '' : r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
