import { StatTile } from '@/components/viz/stat-tile';
import { UptimeRing } from '@/components/viz/uptime-ring';
import { formatCompact, formatNumber, formatRelative } from '@/lib/format';
import type { StatsResponse } from '@tor-sockets/api-contract';
import { Activity, Globe, Network, Scale } from 'lucide-react';

export function StatCards({ stats }: { stats: StatsResponse }) {
  const upPct = stats.relays_total > 0 ? (stats.relays_running / stats.relays_total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Activity}
          label="Relays running"
          value={formatNumber(stats.relays_running)}
          hint={`${formatNumber(stats.relays_stopped)} stopped · ${upPct.toFixed(1)}% up`}
          accent="success"
          aside={<UptimeRing pct={upPct} label={`${upPct.toFixed(1)}% of relays up`} />}
        />
        <StatTile
          icon={Scale}
          label="Consensus weight"
          value={formatCompact(stats.consensus_weight_sum)}
          hint="aggregate · all running relays"
          accent="primary"
        />
        <StatTile
          icon={Globe}
          label="Countries"
          value={formatNumber(stats.countries)}
          hint="distinct (geo)"
          accent="exit"
        />
        <StatTile
          icon={Network}
          label="Autonomous systems"
          value={formatNumber(stats.autonomous_systems)}
          hint={`${formatNumber(stats.hosters)} hosters`}
          accent="authority"
        />
      </div>

      <ConsensusStrip ts={stats.last_consensus} />
    </div>
  );
}

function ConsensusStrip({ ts }: { ts: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-border/60 bg-card/40 px-4 py-2.5 text-xs">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      <span className="font-condensed font-medium tracking-[0.12em] text-muted-foreground uppercase">
        Live · last consensus
      </span>
      <span className="font-mono text-foreground">{ts ? formatRelative(ts) : '-'}</span>
      {ts ? (
        <span className="font-mono text-muted-foreground/60">
          ({new Date(ts).toISOString().slice(0, 19)}Z)
        </span>
      ) : null}
    </div>
  );
}
