import { NetworkHistoryCharts } from '@/components/network-history/network-history-charts';
import { PageHeader } from '@/components/page-header';
import { SegmentedToggleLink } from '@/components/viz/segmented-toggle';
import { getHhiTrend, getNetworkHistory } from '@/lib/api/queries';
import { formatBandwidth, formatCompact, formatNumber } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { getDb } from '@tor-sockets/db';

export const metadata = pageMetadata({
  title: 'Network History',
  description:
    'Hourly evolution of the Tor network over 7 to 90 days: relays running and stopped, consensus weight, advertised bandwidth and capacity split by role.',
  path: '/network-history',
});

// History grows hourly; revalidate every 60s.
export const revalidate = 60;

const PRESETS = [7, 14, 30, 90];

function windowOptions(days: number) {
  return PRESETS.map((d) => ({
    value: String(d),
    label: `${d}d`,
    href: d === 14 ? '/network-history' : `/network-history?days=${d}`,
    active: days === d,
  }));
}

export default async function NetworkHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const daysRaw = Number.parseInt(typeof sp.days === 'string' ? sp.days : '', 10);
  const days = PRESETS.includes(daysRaw) ? daysRaw : 14;

  const db = getDb(process.env.DATABASE_URL);
  // Both reads depend only on `days`: fetch them together instead of hitting the
  // hypertable sequentially (two round-trips -> one).
  const [data, trend] = await Promise.all([
    getNetworkHistory(db, { days }),
    getHhiTrend(db, { windowDays: days }),
  ]);
  const pts = data.points;
  const first = pts[0];
  const last = pts[pts.length - 1];

  // HHI per dimension over time (reuses the /trends computation), merged into
  // rows keyed by timestamp so all dimensions plot on one chart.
  const byTime = new Map<string, Record<string, number | string>>();
  for (const dim of trend.dimensions) {
    for (const p of dim.points) {
      const row = byTime.get(p.time) ?? { time: p.time };
      row[dim.dimension] = p.hhi;
      byTime.set(p.time, row);
    }
  }
  const hhiPoints = [...byTime.values()].sort((a, b) =>
    String(a.time).localeCompare(String(b.time)),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network History"
        align="start"
        // Plain string, not JSX children: interpolating the window inline
        // rendered "14days". JSX drops the whitespace between an expression and
        // the text that follows it across a line break, and the sentence is long
        // enough that the formatter keeps wrapping it there - so the bug comes
        // back every time the file is reformatted. A template literal has no
        // whitespace rules to lose.
        description={`Hourly network evolution over the last ${data.window_days} days, from the relay history. Advertised bandwidth is each relay's declared capacity - not measured throughput (Tor does not expose real throughput per relay).`}
        aside={<SegmentedToggleLink options={windowOptions(days)} />}
      />

      {pts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history recorded yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Delta
              label="Relays running"
              last={last.relays_running}
              first={first.relays_running}
              fmt={formatNumber}
            />
            <Delta
              label="Consensus weight"
              last={last.consensus_weight}
              first={first.consensus_weight}
              fmt={formatCompact}
            />
            <Delta
              label="Advertised bandwidth"
              last={last.advertised_bandwidth}
              first={first.advertised_bandwidth}
              fmt={formatBandwidth}
            />
          </div>

          <NetworkHistoryCharts pts={pts} hhiPoints={hhiPoints} />
        </>
      )}
    </div>
  );
}

function Delta({
  label,
  last,
  first,
  fmt,
}: {
  label: string;
  last: number;
  first: number;
  fmt: (n: number) => string;
}) {
  const delta = last - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  const up = delta >= 0;
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{fmt(last)}</p>
      <p className={cn('mt-1 text-xs tabular-nums', up ? 'text-sev-low' : 'text-sev-high')}>
        {up ? '▲' : '▼'} {fmt(Math.abs(delta))} ({pct.toFixed(1)}%)
      </p>
    </div>
  );
}
