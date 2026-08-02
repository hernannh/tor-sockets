import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarRow } from '@/components/viz/bar-row';
import { ConcentrationGauge } from '@/components/viz/concentration-gauge';
import { getFamilies } from '@/lib/api/queries';
import { formatHhi, formatNumber, formatPct, hhiLabel, hhiSeverity } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { getDb } from '@tor-sockets/db';
import Link from 'next/link';

export const metadata = pageMetadata({
  title: 'Operator Families',
  description:
    'Concentration by operator family, derived from the effective_family graph of the signed consensus: how much guard and exit weight each declared operator controls.',
  path: '/families',
});

export const revalidate = 60;

const PAGE_SIZE = 50;

const SEVERITY_STYLES: Record<string, string> = {
  low: 'border-sev-low/30 bg-sev-low/10 text-sev-low',
  moderate: 'border-sev-medium/30 bg-sev-medium/10 text-sev-medium',
  high: 'border-sev-critical/30 bg-sev-critical/10 text-sev-critical',
};

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const raw = await searchParams;
  const offset = Number(typeof raw.offset === 'string' ? raw.offset : 0) || 0;

  const db = getDb(process.env.DATABASE_URL);
  const data = await getFamilies(db, { limit: PAGE_SIZE, offset });

  if (!data) {
    return (
      <div className="space-y-5">
        <Header />
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No family snapshot has been computed yet.
        </div>
      </div>
    );
  }

  const severity = hhiSeverity(data.hhi);
  const maxGuard = Math.max(...data.families.map((f) => f.guard_weight_pct ?? 0), 1);
  const maxExit = Math.max(...data.families.map((f) => f.exit_weight_pct ?? 0), 1);

  return (
    <div className="space-y-5">
      <Header total={data.total_families} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle>Family concentration (HHI)</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Herfindahl-Hirschman Index over operator families, incl. solo relays as families of
              one.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
                HHI
              </p>
              <p className="font-mono text-3xl font-semibold tabular-nums">{formatHhi(data.hhi)}</p>
            </div>
            <span
              className={cn(
                'mb-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                SEVERITY_STYLES[severity],
              )}
            >
              {hhiLabel(data.hhi)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ConcentrationGauge hhi={data.hhi} severity={severity} />
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="hidden w-10 text-right sm:table-cell">#</TableHead>
            <TableHead>Family</TableHead>
            <TableHead className="text-right">Relays</TableHead>
            <TableHead className="hidden w-40 md:table-cell">Guard / Exit share</TableHead>
            <TableHead className="text-right">Guard</TableHead>
            <TableHead className="text-right">Exit</TableHead>
            <TableHead className="text-right">Weight</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.families.map((f, i) => {
            const guard = f.guard_weight_pct ?? 0;
            const exit = f.exit_weight_pct ?? 0;
            return (
              <TableRow key={f.key} className="group">
                <TableCell className="hidden text-right font-mono text-xs text-muted-foreground tabular-nums sm:table-cell">
                  {data.offset + i + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/families/${f.key}`}
                    className="font-medium transition-colors group-hover:text-foreground"
                  >
                    {f.label ?? `${f.key.slice(0, 10)}…`}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{f.key.slice(0, 16)}…</p>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(f.relay_count)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <BarRow
                    variant="dual"
                    tone="bg-role-guard/70"
                    bar={guard / maxGuard}
                    exitTick={exit / maxExit}
                    trackClassName="h-5 rounded"
                  />
                </TableCell>
                <TableCell className="text-right font-mono text-role-guard tabular-nums">
                  {formatPct(guard)}
                </TableCell>
                <TableCell className="text-right font-mono text-role-exit tabular-nums">
                  {formatPct(exit)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(f.consensus_weight_sum)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Pagination
        basePath="/families"
        searchParams={{ offset: String(data.offset) }}
        offset={data.offset}
        limit={data.limit}
        total={data.total_families}
      />
    </div>
  );
}

function Header({ total }: { total?: number }) {
  return (
    <PageHeader
      title="Operator Families"
      description={
        <>
          {total !== undefined ? `${total.toLocaleString()} families (≥2 relays). ` : ''}
          Relays that mutually declare each other as family - one operator's footprint, across AS
          and country.
        </>
      }
    />
  );
}
