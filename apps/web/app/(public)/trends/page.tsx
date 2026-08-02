import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendChart } from '@/components/viz/charts/trend-chart';
import { SegmentedToggleLink } from '@/components/viz/segmented-toggle';
import { getHhiTrend } from '@/lib/api/queries';
import { formatNumber, hhiLabel } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import type { HhiRole, HhiTrendResponse } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';

export const metadata = pageMetadata({
  title: 'Concentration Trends',
  description:
    'Herfindahl-Hirschman Index over the last 14 days by country, AS, hoster and operator family, per role - is the exit network centralising?',
  path: '/trends',
});

export const revalidate = 60;

const DIM_LABEL: Record<string, string> = {
  country: 'Country',
  as: 'Autonomous System',
  hoster: 'Hoster',
  family: 'Operator family',
};

const DIR_TONE: Record<string, string> = {
  rising: 'text-sev-high',
  falling: 'text-sev-low',
  flat: 'text-muted-foreground',
};
const DIR_ARROW: Record<string, string> = { rising: '▲', falling: '▼', flat: '▬' };
const DIR_STROKE: Record<string, string> = {
  rising: 'var(--sev-high)',
  falling: 'var(--sev-low)',
  flat: 'var(--muted-foreground)',
};

const ROLES: HhiRole[] = ['consensus', 'guard', 'middle', 'exit'];

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const raw = await searchParams;
  const rawRole = typeof raw.role === 'string' ? raw.role : 'consensus';
  const role = (ROLES.includes(rawRole as HhiRole) ? rawRole : 'consensus') as HhiRole;

  const db = getDb(process.env.DATABASE_URL);
  const data = await getHhiTrend(db, { role });
  // Stable order; only render dimensions that actually have snapshots.
  const order = ['as', 'country', 'hoster', 'family'];
  const dims = [...data.dimensions].sort(
    (a, b) => order.indexOf(a.dimension) - order.indexOf(b.dimension),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Concentration Trends"
        align="start"
        description={
          <>
            Herfindahl-Hirschman Index over the last {data.window_days} days per dimension, for the{' '}
            <span className="font-medium text-foreground">{role}</span> role. Exit HHI over time
            answers: is the exit network centralizing?
          </>
        }
        aside={
          <SegmentedToggleLink
            options={ROLES.map((r) => ({
              value: r,
              label: r.charAt(0).toUpperCase() + r.slice(1),
              href: r === 'consensus' ? '/trends' : `/trends?role=${r}`,
              active: role === r,
            }))}
          />
        }
      />

      {dims.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No concentration snapshots in the window yet.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {dims.map((d) => (
            <TrendCard key={d.dimension} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrendCard({ d }: { d: HhiTrendResponse['dimensions'][number] }) {
  const arrow = DIR_ARROW[d.direction];
  const tone = DIR_TONE[d.direction];
  const sign = d.delta > 0 ? '+' : '';
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{DIM_LABEL[d.dimension] ?? d.dimension}</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{hhiLabel(d.latest_hhi)}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {formatNumber(Math.round(d.latest_hhi))}
          </p>
          <p className={cn('font-mono text-xs tabular-nums', tone)}>
            {arrow} {sign}
            {formatNumber(Math.round(d.delta))} · {sign}
            {d.slope_per_day.toFixed(1)}/day
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <TrendChart points={d.points} stroke={DIR_STROKE[d.direction]} />
      </CardContent>
    </Card>
  );
}
