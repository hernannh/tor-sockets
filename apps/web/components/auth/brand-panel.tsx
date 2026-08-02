import { formatNumber } from '@/lib/format';
import type { StatsResponse } from '@tor-sockets/api-contract';
import { Activity, ShieldCheck } from 'lucide-react';

/**
 * Left brand panel of the auth split layout - gives login/signup a sense of
 * the product (logo, tagline, live network KPIs) instead of an empty card.
 * Hidden on mobile (the form takes the full width there).
 */
export function BrandPanel({ stats }: { stats: StatsResponse | null }) {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 bg-card/40 p-10 lg:flex">
      {/* signal-grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* primary glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Activity className="size-5" />
          </span>
          <span className="font-mono text-lg font-semibold tracking-tight">tor·sockets</span>
        </div>
      </div>

      <div className="relative max-w-md space-y-4">
        <h2 className="font-condensed text-3xl font-semibold tracking-tight">
          Federated Tor network health &amp; concentration monitor.
        </h2>
        <p className="text-sm text-muted-foreground">
          Independent, verifiable telemetry for the relay network - concentration (HHI), anomaly
          detection, and a signed federation protocol anyone can run.
        </p>
      </div>

      <div className="relative space-y-4">
        {stats ? (
          <div className="grid grid-cols-3 gap-4">
            <BrandStat value={formatNumber(stats.relays_running)} label="relays up" />
            <BrandStat value={formatNumber(stats.countries)} label="countries" />
            <BrandStat value={formatNumber(stats.autonomous_systems)} label="networks" />
          </div>
        ) : null}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" />
          Federated · Ed25519-signed payloads
        </div>
      </div>
    </div>
  );
}

function BrandStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
      <p className="font-condensed text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}
