import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { RelayFilters } from '@/components/relays/relay-filters';
import { RelayTable } from '@/components/relays/relay-table';
import { Skeleton } from '@/components/ui/skeleton';
import { parseQuery } from '@/lib/api/handler';
import { getCountryOptions, getRelays } from '@/lib/api/queries';
import { pageMetadata } from '@/lib/seo';
import { relaysQuerySchema } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';
import { Download } from 'lucide-react';
import { Suspense } from 'react';

export const metadata = pageMetadata({
  title: 'Relay Directory',
  description:
    'Search the Tor relay directory: nickname, fingerprint, country, autonomous system, flags, consensus weight and observed bandwidth for every relay in the current consensus.',
  path: '/relays',
});

const PAGE_SIZE = 25;

export default async function RelaysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = new URLSearchParams();
  const raw = await searchParams;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
  }
  if (!sp.has('limit')) sp.set('limit', String(PAGE_SIZE));

  const parsed = parseQuery(relaysQuerySchema, sp);
  const db = getDb(process.env.DATABASE_URL);

  const [result, countries] = await Promise.all([
    getRelays(
      db,
      parsed.success
        ? parsed.data
        : { limit: PAGE_SIZE, offset: 0, sort: 'consensus_weight', order: 'desc' },
    ),
    getCountryOptions(db),
  ]);

  const exportHref = `/api/v1/relays/export.csv?${sp.toString()}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relay Directory"
        description={`${result.total.toLocaleString()} relays indexed. Click a column to sort, a row for full detail.`}
        aside={
          <a
            href={exportHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Download className="size-3.5" /> Export CSV
          </a>
        }
      />

      <Suspense
        fallback={
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/30 p-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
        }
      >
        <RelayFilters countries={countries} />
      </Suspense>

      <RelayTable
        relays={result.relays}
        sort={parsed.success ? parsed.data.sort : 'consensus_weight'}
        order={parsed.success ? parsed.data.order : 'desc'}
        queryParams={Object.fromEntries(sp.entries())}
      />

      <Pagination
        basePath="/relays"
        searchParams={Object.fromEntries(sp.entries())}
        offset={result.offset}
        limit={result.limit}
        total={result.total}
      />
    </div>
  );
}
