import { HealthScorecard, type SignalTone } from '@/components/health/health-scorecard';
import { PageHeader, SectionHeading } from '@/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { BarList } from '@/components/viz/bar-list';
import { StatTile } from '@/components/viz/stat-tile';
import { getBandwidth, getExits, getIpv6, getOverload } from '@/lib/api/queries';
import { formatBandwidth, formatNumber, formatPct } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { getDb } from '@tor-sockets/db';
import Link from 'next/link';

export const metadata = pageMetadata({
  title: 'Network Health',
  description:
    'Tor network health signals over the running relay set: overload reports, IPv6 reachability, bandwidth-measurement coverage and exit capacity.',
  path: '/health',
});

export const revalidate = 60;

export default async function HealthPage() {
  const db = getDb(process.env.DATABASE_URL);
  const [overload, ipv6, bandwidth, exits] = await Promise.all([
    getOverload(db),
    getIpv6(db),
    getBandwidth(db),
    getExits(db),
  ]);

  const maxOvl = Math.max(...overload.by_country.map((c) => c.overloaded_pct), 1);
  const maxV6 = Math.max(...ipv6.by_country.map((c) => c.ipv6_pct), 1);
  const maxExitW = Math.max(...exits.by_country.map((c) => c.exit_consensus_weight), 1);
  const pctOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

  // Threshold bands for the overview scorecard. Overload: lower is better;
  // IPv6 / bandwidth / exit-weight: higher is better.
  const band = (v: number, good: number, warn: number, higherBetter = true): SignalTone => {
    if (higherBetter) return v >= good ? 'good' : v >= warn ? 'warn' : 'bad';
    return v <= good ? 'good' : v <= warn ? 'warn' : 'bad';
  };
  const signals = [
    {
      value: 'overload',
      label: 'Overload',
      metric: formatPct(overload.overloaded_weight_pct),
      sub: 'weight reporting overload',
      tone: band(overload.overloaded_weight_pct, 5, 15, false),
    },
    {
      value: 'ipv6',
      label: 'IPv6',
      metric: formatPct(ipv6.ipv6_weight_pct),
      sub: 'dual-stack weight',
      tone: band(ipv6.ipv6_weight_pct, 60, 40),
    },
    {
      value: 'bandwidth',
      label: 'Bandwidth',
      metric: formatPct(bandwidth.measured_weight_pct),
      sub: 'measured by bwauths',
      tone: band(bandwidth.measured_weight_pct, 99, 90),
    },
    {
      value: 'exit',
      label: 'Exit capacity',
      metric: formatPct(exits.exit_weight_pct),
      sub: 'of consensus weight',
      tone: band(exits.exit_weight_pct, 28, 18),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network Health"
        description="Point-in-time health signals over the running relay set: overload, IPv6 reachability, bandwidth-measurement coverage and exit capacity. Source: Onionoo. Pick a signal to open its detail."
      />

      <Tabs defaultValue="overload" className="gap-6">
        <HealthScorecard signals={signals} />

        {/* Overload */}
        <TabsContent value="overload" className="space-y-4">
          <SectionHeading>Overload</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Overloaded (relays)"
              value={formatPct(overload.overloaded_relays_pct)}
              tone="text-sev-high"
              hint={`${formatNumber(overload.overloaded_relays)} relays reporting overload`}
            />
            <StatTile
              label="Overloaded (weight)"
              value={formatPct(overload.overloaded_weight_pct)}
              tone="text-sev-medium"
              hint={`${formatNumber(overload.overloaded_consensus_weight)} weight`}
            />
            <StatTile
              label="Relays analysed"
              value={formatNumber(overload.total_relays)}
              tone="text-foreground"
              hint="running relays"
            />
          </div>
          {overload.by_country.length > 0 && (
            <BarList
              title="Where overload concentrates (top countries)"
              rows={overload.by_country.map((c) => ({
                key: c.country ?? '-',
                label: c.country ?? '-',
                bar: c.overloaded_pct / maxOvl,
                tone: 'bg-sev-high/60',
                right: `${formatNumber(c.overloaded_relays)}/${formatNumber(c.relays)}`,
              }))}
            />
          )}
        </TabsContent>

        {/* IPv6 */}
        <TabsContent value="ipv6" className="space-y-4">
          <SectionHeading>IPv6 support</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatTile
              label="Dual-stack (relays)"
              value={formatPct(ipv6.ipv6_relays_pct)}
              tone="text-sev-low"
              hint={`${formatNumber(ipv6.ipv6_relays)} relays`}
            />
            <StatTile
              label="Dual-stack (weight)"
              value={formatPct(ipv6.ipv6_weight_pct)}
              tone="text-sev-low"
              hint={`${formatNumber(ipv6.ipv6_consensus_weight)} weight`}
            />
            <StatTile
              label="IPv6 guards"
              value={formatNumber(ipv6.ipv6_guard_relays)}
              tone="text-foreground"
              hint="guard relays on v6"
            />
            <StatTile
              label="IPv6 exits"
              value={formatNumber(ipv6.ipv6_exit_relays)}
              tone="text-foreground"
              hint="exit relays on v6"
            />
          </div>
          {ipv6.by_country.length > 0 && (
            <BarList
              title="IPv6 adoption by country (largest relay sets)"
              rows={ipv6.by_country.map((c) => ({
                key: c.country ?? '-',
                label: c.country ?? '-',
                bar: c.ipv6_pct / maxV6,
                tone: 'bg-sev-low/60',
                right: formatPct(c.ipv6_pct),
              }))}
            />
          )}
        </TabsContent>

        {/* Bandwidth measurement */}
        <TabsContent value="bandwidth" className="space-y-4">
          <SectionHeading>Bandwidth measurement</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Measured (weight)"
              value={formatPct(bandwidth.measured_weight_pct)}
              tone="text-sev-low"
              hint={`${formatNumber(bandwidth.measured_relays)} relays measured by bwauths`}
            />
            <StatTile
              label="Unmeasured (relays)"
              value={formatNumber(bandwidth.unmeasured_relays)}
              tone="text-sev-medium"
              hint={`${formatNumber(bandwidth.unmeasured_consensus_weight)} weight self-advertised`}
            />
            <StatTile
              label="Advertised bandwidth"
              value={formatBandwidth(bandwidth.advertised_bandwidth_sum)}
              tone="text-foreground"
              hint={`observed ${formatBandwidth(bandwidth.observed_bandwidth_sum)}`}
            />
          </div>
          {bandwidth.top_unmeasured.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">Largest unmeasured relays</h3>
                <span className="text-xs text-muted-foreground">
                  all pinned at the 20-weight floor until a bwauth measures them
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Relay</TableHead>
                    <TableHead className="text-right">Consensus weight</TableHead>
                    <TableHead className="text-right">Advertised</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bandwidth.top_unmeasured.slice(0, 6).map((r) => (
                    <TableRow key={r.fingerprint}>
                      <TableCell>
                        <Link
                          href={`/relays/${r.fingerprint}`}
                          className="font-mono hover:underline"
                        >
                          {r.nickname}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatNumber(r.consensus_weight)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatBandwidth(r.advertised_bandwidth)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Exit scarcity */}
        <TabsContent value="exit" className="space-y-4">
          <SectionHeading>Exit capacity</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatTile
              label="Exit weight"
              value={formatPct(exits.exit_weight_pct)}
              tone="text-sev-medium"
              hint={`${formatNumber(exits.exit_relays)} exit relays`}
            />
            <StatTile
              label="Allow :443"
              value={formatPct(pctOf(exits.exits_port_443, exits.exit_relays))}
              tone="text-sev-low"
              hint={`${formatNumber(exits.exits_port_443)} exits · ${formatNumber(exits.exits_port_443_weight)} weight`}
            />
            <StatTile
              label="Allow :80"
              value={formatPct(pctOf(exits.exits_port_80, exits.exit_relays))}
              tone="text-sev-low"
              hint={`${formatNumber(exits.exits_port_80)} exits · ${formatNumber(exits.exits_port_80_weight)} weight`}
            />
            <StatTile
              label="Allow both"
              value={formatNumber(exits.exits_both_ports)}
              tone="text-foreground"
              hint="exits allowing 80 + 443"
            />
          </div>
          {exits.by_country.length > 0 && (
            <BarList
              title="Exit weight by country (scarce resource)"
              rows={exits.by_country.map((c) => ({
                key: c.country ?? '-',
                label: c.country ?? '-',
                bar: c.exit_consensus_weight / maxExitW,
                tone: 'bg-sev-medium/60',
                right: formatNumber(c.exit_relays),
              }))}
            />
          )}

          {exits.port_diversity.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">
                Port diversity - who can carry which traffic (fewest operators first)
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Port</TableHead>
                    <TableHead className="text-right">Exit relays</TableHead>
                    <TableHead className="text-right">ASes</TableHead>
                    <TableHead className="text-right">Exit capacity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exits.port_diversity.map((p) => (
                    <TableRow key={p.port}>
                      <TableCell className="font-mono text-sm">
                        {p.port} <span className="text-xs text-muted-foreground">{p.name}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatNumber(p.relays)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono tabular-nums',
                          p.as_count <= 10
                            ? 'text-sev-critical'
                            : p.as_count <= 25
                              ? 'text-sev-medium'
                              : '',
                        )}
                      >
                        {formatNumber(p.as_count)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatPct(p.exit_weight_pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                A low AS count means traffic to that port is forced through few operators - easier
                to surveil or censor.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
