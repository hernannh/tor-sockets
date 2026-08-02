import { PageHeader, SectionHeading } from '@/components/page-header';
import { StatusComposition } from '@/components/versions/status-composition';
import { VersionBranches } from '@/components/versions/version-branches';
import { StatTile } from '@/components/viz/stat-tile';
import { getVersions } from '@/lib/api/queries';
import { formatNumber, formatPct } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { getDb } from '@tor-sockets/db';

export const metadata = pageMetadata({
  title: 'Versions & EOL',
  description:
    'Tor version and end-of-life distribution by relay count and consensus weight - how much of the network still runs obsolete or unrecommended releases.',
  path: '/versions',
});

export const revalidate = 60;

export default async function VersionsPage() {
  const db = getDb(process.env.DATABASE_URL);
  const data = await getVersions(db);

  const obsolete = data.by_status.find((s) => s.status === 'obsolete');
  const obsoleteWeightPct = obsolete?.weight_pct ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Versions & EOL"
        description="How much of the network still runs obsolete Tor versions. Status comes from the consensus (recommended / obsolete / experimental)."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Recommended (weight)"
          value={formatPct(data.recommended.weight_pct)}
          tone="text-sev-low"
          hint={`${formatNumber(data.recommended.relays)} relays`}
        />
        <StatTile
          label="Obsolete (weight)"
          value={formatPct(obsoleteWeightPct)}
          tone="text-sev-critical"
          hint={`${formatNumber(obsolete?.relays ?? 0)} relays on EOL versions`}
        />
        <StatTile
          label="Relays analysed"
          value={formatNumber(data.total_relays)}
          tone="text-foreground"
          hint={`${formatNumber(data.total_consensus_weight)} total weight`}
        />
      </div>

      <StatusComposition buckets={data.by_status} />

      <div className="space-y-2">
        <SectionHeading
          aside={
            <span className="font-mono text-xs text-muted-foreground">
              click a branch to expand
            </span>
          }
        >
          Top versions by release branch
        </SectionHeading>
        <VersionBranches versions={data.top_versions} />
      </div>
    </div>
  );
}
