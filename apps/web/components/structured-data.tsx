import { REPO_URL } from '@/lib/site';

const BASE = (process.env.TOR_SOCKETS_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/**
 * JSON-LD for the landing page.
 *
 * Three graphs: the site itself (with the relay directory as its search
 * action), the project behind it, and - the one that matters here - a `Dataset`.
 * The whole point of the project is derived-but-verifiable open data, and
 * `Dataset` is what makes the API discoverable as data rather than as a page:
 * it names the distributions (JSON and CSV), the licence, and the upstream
 * source.
 *
 * Rendered as a `<script type="application/ld+json">` inside a prerendered
 * page, which is the CSP-compatible spot: prerendered HTML keeps
 * `'unsafe-inline'` (Next cannot nonce it), while the nonce + `strict-dynamic`
 * policy only applies to dynamic routes.
 */
export function LandingStructuredData({ relayCount }: { relayCount?: number | null }) {
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${BASE}/#website`,
      url: BASE,
      name: 'Tor-Sockets',
      description:
        'Federated, real-time monitor of Tor network concentration and health: how much guard and exit weight sits in one country, AS, or operator.',
      inLanguage: 'en',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${BASE}/relays?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Dataset',
      '@id': `${BASE}/#dataset`,
      name: 'Tor network concentration and health metrics',
      description:
        'Hourly metrics derived from the signed Tor consensus: Herfindahl-Hirschman concentration by country, autonomous system, hoster and operator family (split by guard, middle and exit role), Nakamoto coefficients, guard-to-exit correlation risk, undeclared operator families, version/EOL distribution, IPv6 and overload signals, and detected anomalies.',
      url: BASE,
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      isAccessibleForFree: true,
      creator: { '@id': `${BASE}/#project` },
      temporalCoverage: '2026-07/..',
      keywords: [
        'Tor',
        'network concentration',
        'Herfindahl-Hirschman Index',
        'anonymity',
        'relay diversity',
        'autonomous system',
        'exit relays',
        'Nakamoto coefficient',
      ],
      isBasedOn: [
        { '@type': 'Dataset', name: 'Onionoo', url: 'https://onionoo.torproject.org/' },
        { '@type': 'Dataset', name: 'CollecTor', url: 'https://collector.torproject.org/' },
      ],
      ...(relayCount ? { variableMeasured: `${relayCount} running relays` } : {}),
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `${BASE}/api/v1/concentration`,
          name: 'Concentration snapshot (JSON)',
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/csv',
          contentUrl: `${BASE}/api/v1/concentration?format=csv`,
          name: 'Concentration snapshot (CSV)',
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `${BASE}/api/v1/openapi.json`,
          name: 'OpenAPI description of the full API',
        },
      ],
    },
    {
      '@type': 'SoftwareSourceCode',
      '@id': `${BASE}/#project`,
      name: 'Tor-Sockets',
      description:
        'Self-hostable, federated monitor of Tor network concentration and health. Instances peer over a versioned Ed25519-signed protocol so no single directory owns the data.',
      ...(REPO_URL ? { codeRepository: REPO_URL } : {}),
      programmingLanguage: 'TypeScript',
      license: 'https://opensource.org/licenses/MIT',
      url: BASE,
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Values are project constants and one integer, so there is no
      // operator-controlled string to escape here.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }),
      }}
    />
  );
}
