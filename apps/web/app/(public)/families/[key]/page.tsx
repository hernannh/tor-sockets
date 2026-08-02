import { PageHeader, SectionHeading } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getFamilyDetail } from '@/lib/api/queries';
import { formatNumber, formatPct } from '@/lib/format';
import { countryFlag, countryName } from '@/lib/geo';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { getDb } from '@tor-sockets/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  return pageMetadata({
    title: `Family ${key.slice(0, 8)}`,
    description: `Tor operator family ${key.slice(0, 8)}: member relays, guard/middle/exit weight share, and how the family spreads across autonomous systems and countries.`,
    path: `/families/${key}`,
  });
}

export default async function FamilyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  if (!/^[0-9A-Fa-f]{40}$/.test(key)) notFound();

  const db = getDb(process.env.DATABASE_URL);
  const family = await getFamilyDetail(db, key);
  if (!family) notFound();

  // Paginate the member list - a large operator family can have hundreds of
  // relays, which otherwise becomes an endless scroll.
  const LIMIT = 25;
  const sp = await searchParams;
  const offsetRaw = typeof sp.offset === 'string' ? Number.parseInt(sp.offset, 10) : 0;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  const members = family.members;
  const pageMembers = members.slice(offset, offset + LIMIT);
  const flatSearchParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flatSearchParams[k] = Array.isArray(v) ? v[0] : v;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/families', label: 'Operator Families' }}
        title={family.label ?? `Family ${family.key.slice(0, 8)}`}
        description={<span className="font-mono text-xs">{family.key}</span>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Relays" value={formatNumber(family.relay_count)} />
        <Stat label="Guard share" value={formatPct(family.guard_weight_pct)} tone="role-guard" />
        <Stat label="Middle share" value={formatPct(family.middle_weight_pct)} />
        <Stat label="Exit share" value={formatPct(family.exit_weight_pct)} tone="role-exit" />
        <Stat label="Countries" value={String(family.countries.length)} />
        <Stat label="Autonomous systems" value={String(family.autonomous_systems.length)} />
      </div>

      <section className="space-y-2">
        <SectionHeading>Spread</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Countries:{' '}
          {family.countries.length === 0 ? (
            <span className="text-muted-foreground/60">-</span>
          ) : (
            family.countries.map((c) => (
              <span key={c} className="mr-2 font-mono text-foreground" title={countryName(c)}>
                {countryFlag(c)} {c.toUpperCase()}
              </span>
            ))
          )}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Autonomous system</TableHead>
              <TableHead className="text-right">Relays in family</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {family.autonomous_systems.map((a) => (
              <TableRow key={a.as_number ?? 'none'}>
                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground">
                    {a.as_number ?? '-'}
                  </span>{' '}
                  {a.as_name ?? ''}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{a.relay_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-2">
        <SectionHeading>Member relays ({members.length})</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nickname</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>AS</TableHead>
              <TableHead className="text-right">Guard</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="text-right">Weight</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageMembers.map((m) => (
              <TableRow key={m.fingerprint} className="group">
                <TableCell>
                  <Link
                    href={`/relays/${m.fingerprint}`}
                    className="font-medium transition-colors group-hover:text-foreground"
                  >
                    {m.nickname}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {m.country ? `${countryFlag(m.country)} ${m.country.toUpperCase()}` : '-'}
                </TableCell>
                <TableCell
                  className="max-w-48 truncate text-xs text-muted-foreground"
                  title={m.as_name ?? ''}
                >
                  {m.as_number ?? '-'}
                </TableCell>
                <TableCell className="text-right font-mono text-role-guard tabular-nums">
                  {formatPct(m.guard_probability == null ? null : m.guard_probability * 100)}
                </TableCell>
                <TableCell className="text-right font-mono text-role-exit tabular-nums">
                  {formatPct(m.exit_probability == null ? null : m.exit_probability * 100)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(m.consensus_weight)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {members.length > LIMIT ? (
          <Pagination
            basePath={`/families/${key}`}
            searchParams={flatSearchParams}
            offset={offset}
            limit={LIMIT}
            total={members.length}
          />
        ) : null}
      </section>
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  'role-guard': 'text-role-guard',
  'role-exit': 'text-role-exit',
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-xl font-semibold tabular-nums',
          tone ? TONE_CLASS[tone] : 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}
