import type { Metadata } from 'next';

/**
 * Page metadata helper.
 *
 * Every indexable page needs three things a bare `{ title }` does not give it:
 * a description (what Google shows under the link), a canonical URL (so
 * `?dimension=as`, `?page=2` and the like do not fragment the page's ranking
 * across query strings), and share cards. `metadataBase` lives in the root
 * layout, so paths here stay relative.
 *
 * `noIndex` is for surfaces that must never rank: auth screens and the operator
 * console. They are still crawlable-by-link, just not indexed.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const { title, description, path, noIndex } = opts;
  const fullTitle = `${title} · Tor-Sockets`;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      url: path,
      title: fullTitle,
      description,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: ['/opengraph-image'],
    },
  };
}
