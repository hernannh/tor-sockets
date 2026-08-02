'use client';

import type { ConcentrationResponse } from '@tor-sockets/api-contract';
import dynamic from 'next/dynamic';

// maplibre-gl (~300 KB) only runs in the browser and can't be SSR'd, and
// `next/dynamic({ ssr: false })` isn't allowed inside a Server Component. This
// thin client boundary lets the /map page split maplibre into a client-only
// chunk so it never lands in the route's initial bundle. See the
// vercel-react-best-practices `bundle-dynamic-imports` rule.
const RelayMap = dynamic(() => import('@/components/relay-map').then((m) => m.RelayMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100dvh-17rem)] min-h-[460px] items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
      loading map…
    </div>
  ),
});

export function RelayMapLazy({ data }: { data: ConcentrationResponse }) {
  return <RelayMap data={data} />;
}
