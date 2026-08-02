import { HiddenFamiliesTable } from '@/components/hidden-families-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { getHiddenFamilies } from '@/lib/api/queries';
import { formatNumber, formatPct } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { getDb } from '@tor-sockets/db';
import { Download } from 'lucide-react';

export const metadata = pageMetadata({
  title: 'Hidden Families',
  description:
    'Undeclared operator families: relays sharing a contact but not declared as one family, ranked by deanonymisation risk (guard share x exit share).',
  path: '/hidden-families',
});

export const revalidate = 60;

// deanon_risk is guardShare x exitShare (fraction). Tone by magnitude.
function riskTone(risk: number): string {
  if (risk >= 0.01) return 'text-sev-critical';
  if (risk >= 0.003) return 'text-sev-high';
  if (risk >= 0.001) return 'text-sev-medium';
  return 'text-muted-foreground';
}

export default async function HiddenFamiliesPage() {
  const db = getDb(process.env.DATABASE_URL);
  const data = await getHiddenFamilies(db);

  const topRisk = data.clusters[0]?.deanon_risk ?? 0;
  const totalUndeclared = data.clusters.reduce((a, c) => a + c.undeclared_relays, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hidden Families"
        align="start"
        description={
          <>
            Operators whose relays share a contact but are <strong>not</strong> declared as one Tor
            family. Path selection treats them as independent - so a single hidden operator can sit
            on both the <span className="text-role-guard">guard</span> and the{' '}
            <span className="text-role-exit">exit</span> of the same circuit and correlate the
            traffic. Ranked by <strong>deanon risk</strong> = guard share x exit share (the chance a
            random circuit hands this operator both ends).
          </>
        }
        aside={
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href="/api/v1/hidden-families?format=csv">
              <Download className="size-4" /> Download CSV
            </a>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Hidden operators"
          value={formatNumber(data.total_clusters)}
          tone="text-sev-high"
          sub={`>= ${data.min_relays} relays, split across >=2 declared families`}
        />
        <Stat
          label="Top deanon risk"
          value={formatPct(topRisk * 100, 3)}
          tone={riskTone(topRisk)}
          sub="of circuits, both ends = one hidden operator"
        />
        <Stat
          label="Undeclared relays"
          value={formatNumber(totalUndeclared)}
          tone="text-foreground"
          sub="running relays that declare no family"
        />
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Reading this:</strong> a listed operator is <em>not</em>{' '}
        assumed malicious. Many are well-known, non-profit, domain-verified operators (look for the{' '}
        <span className="text-sev-low">✓</span>) - the flag is a structural observation that their
        relays aren&apos;t a single declared family, which lets path selection use two of them in
        one circuit. Click a row for the AS/family breakdown and the math.
      </div>

      {data.clusters.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hidden operator clusters detected.</p>
      ) : (
        <HiddenFamiliesTable clusters={data.clusters} />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn('mt-1 font-mono text-3xl font-semibold tabular-nums', tone)}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
