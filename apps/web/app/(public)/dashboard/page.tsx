import { AnomalyWidget } from '@/components/dashboard/anomaly-widget';
import { ConcentrationPanel } from '@/components/dashboard/concentration-panel';
import { type RiskSignal, RiskStrip, type SignalTone } from '@/components/dashboard/risk-strip';
import { StatCards } from '@/components/dashboard/stat-cards';
import { PageHeader } from '@/components/page-header';
import {
  getConcentration,
  getCorrelationRisk,
  getHiddenFamilies,
  getRecentAnomalies,
  getStats,
  getVersions,
} from '@/lib/api/queries';
import { formatPct } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { HHI_BANDS, describeHhi } from '@tor-sockets/api-contract';
import { parseContactInfo } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';

export const metadata = pageMetadata({
  title: 'Overview',
  description:
    'Live snapshot of the Tor relay network: relays running, consensus weight, countries and autonomous systems, with HHI concentration by role and the latest anomalies.',
  path: '/dashboard',
});

// Data changes at most once per hour (consensus cycle). Revalidate the static
// render every 60s so a fresh consensus shows up within a minute.
export const revalidate = 60;

// Higher value = worse for correlation/EOL; HHI reuses the shared bands.
const band = (v: number, warn: number, bad: number): SignalTone =>
  v >= bad ? 'bad' : v >= warn ? 'warn' : 'good';

export default async function DashboardPage() {
  const db = getDb(process.env.DATABASE_URL);

  const [stats, country, asDim, hoster, family, anomalies, correlation, hidden, versions] =
    await Promise.all([
      getStats(db),
      getConcentration(db, 'country', 10),
      getConcentration(db, 'as', 10),
      getConcentration(db, 'hoster', 10),
      getConcentration(db, 'family', 10),
      getRecentAnomalies(db, { limit: 10 }),
      getCorrelationRisk(db, 'as'),
      getHiddenFamilies(db, { limit: 5 }),
      getVersions(db),
    ]);

  const exitHhi = Math.round(country?.hhi_by_role.exit ?? 0);
  const corrPct = correlation.total_risk * 100;
  const obsoletePct = versions.by_status.find((s) => s.status === 'obsolete')?.weight_pct ?? 0;
  const topHidden = hidden.clusters[0];
  const topHiddenName = topHidden
    ? (parseContactInfo(topHidden.contact).domain ??
      parseContactInfo(topHidden.contact).name ??
      'operator')
    : null;

  const signals: RiskSignal[] = [
    {
      href: '/trends?role=exit',
      label: 'Exit-HHI · country',
      value: exitHhi.toLocaleString('en-US'),
      sub: describeHhi(exitHhi),
      tone: band(exitHhi, HHI_BANDS.moderate, HHI_BANDS.high + 1),
    },
    {
      href: '/correlation',
      label: 'Correlation risk',
      value: formatPct(corrPct, 2),
      sub: 'same AS on guard + exit',
      tone: band(corrPct, 1, 3),
    },
    {
      href: '/hidden-families',
      label: 'Hidden operators',
      value: String(hidden.total_clusters),
      sub: topHidden
        ? `top ${topHiddenName} · ${formatPct(topHidden.exit_pct)} exit`
        : 'none flagged',
      tone: topHidden ? band(topHidden.deanon_risk * 100, 0.5, 1.5) : 'good',
    },
    {
      href: '/versions',
      label: 'EOL weight',
      value: formatPct(obsoletePct),
      sub: 'obsolete Tor versions',
      tone: band(obsoletePct, 5, 15),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Live snapshot of the Tor relay network. Aggregated from the latest consensus, ingested hourly via Onionoo."
      />

      <StatCards stats={stats} />

      <RiskStrip signals={signals} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ConcentrationPanel data={{ country, as: asDim, hoster, family }} />
        <AnomalyWidget anomalies={anomalies.anomalies} />
      </div>
    </div>
  );
}
