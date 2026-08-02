import { PageHeader } from '@/components/page-header';
import { RelayMapLazy } from '@/components/relay-map-lazy';
import { Card, CardContent } from '@/components/ui/card';
import { getConcentration } from '@/lib/api/queries';
import { formatNumber, formatRelative } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { getDb } from '@tor-sockets/db';
import { preconnect, prefetchDNS } from 'react-dom';

export const metadata = pageMetadata({
  title: 'Relay Map',
  description:
    'Geographic distribution of running Tor relays aggregated by country, sized by consensus weight and coloured by dominant role - guard, middle or exit.',
  path: '/map',
});

export const revalidate = 60;

export default async function MapPage() {
  const db = getDb(process.env.DATABASE_URL);
  const data = await getConcentration(db, 'country', 500);

  // Warm the DNS + TLS handshake to the CARTO tile CDN before maplibre requests
  // its first tile, so the base map paints without a cold connection.
  prefetchDNS('https://basemaps.cartocdn.com');
  preconnect('https://basemaps.cartocdn.com');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relay Map"
        description="Geographic distribution of running relays, aggregated by country. Bubble size is proportional to consensus weight; color shows the dominant role share."
        aside={
          data ? (
            <p className="font-mono text-xs text-muted-foreground">
              {formatNumber(data.total_relays)} relays · {data.keys.length} countries ·{' '}
              {formatRelative(data.time)}
            </p>
          ) : null
        }
      />

      {data ? (
        <RelayMapLazy data={data} />
      ) : (
        <Card>
          <CardContent>
            <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
              No consensus has been processed yet, so there is nothing to plot.
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Onionoo does not expose per-relay coordinates, so relays are plotted at country centroids
        (privacy-preserving). Hover a bubble for per-country detail.
      </p>
    </div>
  );
}
