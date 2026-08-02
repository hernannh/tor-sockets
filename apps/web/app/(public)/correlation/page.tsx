import { OperatorContact } from '@/components/operator-contact';
import { PageHeader, SectionHeading } from '@/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SegmentedToggleLink } from '@/components/viz/segmented-toggle';
import { getCorrelationRisk } from '@/lib/api/queries';
import { formatPct } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import type { CorrelationDimension } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';
import { BadgeCheck } from 'lucide-react';

export const metadata = pageMetadata({
  title: 'Correlation Risk',
  description:
    'Guard-to-exit correlation risk by autonomous system, hoster or country - the probability that the same entity sits on both ends of a Tor circuit.',
  path: '/correlation',
});

export const revalidate = 60;

const DIMS: { value: CorrelationDimension; label: string }[] = [
  { value: 'as', label: 'Autonomous System' },
  { value: 'hoster', label: 'Hoster' },
  { value: 'country', label: 'Country' },
];

function riskTone(risk: number): string {
  if (risk >= 0.01) return 'text-sev-critical';
  if (risk >= 0.003) return 'text-sev-high';
  if (risk >= 0.001) return 'text-sev-medium';
  return 'text-muted-foreground';
}

export default async function CorrelationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const raw = await searchParams;
  const rawDim = typeof raw.dimension === 'string' ? raw.dimension : 'as';
  const dimension = (DIMS.some((d) => d.value === rawDim) ? rawDim : 'as') as CorrelationDimension;

  const db = getDb(process.env.DATABASE_URL);
  const data = await getCorrelationRisk(db, dimension);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Correlation Risk"
        align="start"
        description={
          <>
            Tor's real threat model: an entity on <strong>both</strong> the{' '}
            <span className="text-role-guard">guard</span> and the{' '}
            <span className="text-role-exit">exit</span> of a circuit can correlate the traffic and
            deanonymize the user. Risk per entity = guard share × exit share; the total is the
            probability a random circuit is exposed to a single such entity.
          </>
        }
        aside={
          <SegmentedToggleLink
            options={DIMS.map((d) => ({
              value: d.value,
              label: d.label,
              href: d.value === 'as' ? '/correlation' : `/correlation?dimension=${d.value}`,
              active: dimension === d.value,
            }))}
          />
        }
      />

      <div className="rounded-lg border border-border p-5">
        <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Total correlation exposure ({dimension})
        </p>
        <p
          className={cn(
            'mt-1 font-mono text-4xl font-semibold tabular-nums',
            riskTone(data.total_risk),
          )}
        >
          {formatPct(data.total_risk * 100, 3)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          of circuits get the same {dimension} on both guard and exit - end-to-end correlation by a
          single entity, no active attack needed.
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Reading this:</strong> a high-risk entity is usually a{' '}
        large, <em>legitimate</em> operator that concentrates both roles - not an attacker.
        Domain-verified operators are marked <span className="text-sev-low">✓</span>. The number is
        the structural exposure (capability), not evidence anyone is doing it.
      </div>

      <div className="space-y-2">
        <SectionHeading
          aside={
            <a
              href={`/api/v1/correlation?dimension=${dimension}&format=csv`}
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              ↓ CSV
            </a>
          }
        >
          Top entities able to correlate
        </SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{DIMS.find((d) => d.value === dimension)?.label ?? dimension}</TableHead>
              <TableHead className="text-right">Guard share</TableHead>
              <TableHead className="text-right">Exit share</TableHead>
              <TableHead className="text-right">Correlation risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.top.map((k) => (
              <TableRow key={k.key}>
                <TableCell className="max-w-sm">
                  <div className="flex items-center gap-1.5">
                    {k.verified && (
                      <BadgeCheck
                        className="size-3.5 shrink-0 text-sev-low"
                        aria-label="verified"
                      />
                    )}
                    <span className="font-mono text-sm">{k.key}</span>
                    {k.label && (
                      <span className="truncate text-xs text-muted-foreground">{k.label}</span>
                    )}
                  </div>
                  {k.operator && (
                    <OperatorContact
                      contact={k.operator}
                      className="mt-0.5 max-w-sm text-[11px] text-muted-foreground/80"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-role-guard tabular-nums">
                  {formatPct(k.guard_share * 100)}
                </TableCell>
                <TableCell className="text-right font-mono text-role-exit tabular-nums">
                  {formatPct(k.exit_share * 100)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-mono font-semibold tabular-nums',
                    riskTone(k.risk),
                  )}
                >
                  {formatPct(k.risk * 100, 3)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Shares are Onionoo path-selection probabilities (the weights Tor uses to pick relays). An
        entity needs both ends of the <em>same</em> circuit; risk = guard×exit is the per-circuit
        probability of that.
      </p>
    </div>
  );
}
