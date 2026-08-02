'use client';

import { FadeSwap } from '@/components/motion/fade-swap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarRow } from '@/components/viz/bar-row';
import { ConcentrationGauge } from '@/components/viz/concentration-gauge';
import { SegmentedToggle } from '@/components/viz/segmented-toggle';
import { formatHhi, formatNumber, formatPct, hhiLabel, hhiSeverity } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  ConcentrationResponse,
  DecentralizationByRole,
  HhiByRole,
  HhiRole,
} from '@tor-sockets/api-contract';
import { useState } from 'react';

type Dimension = 'country' | 'as' | 'hoster' | 'family';

const ROLES: { value: HhiRole; label: string }[] = [
  { value: 'consensus', label: 'Consensus' },
  { value: 'guard', label: 'Guard' },
  { value: 'middle', label: 'Middle' },
  { value: 'exit', label: 'Exit' },
];

const DIMENSIONS: readonly Dimension[] = ['country', 'as', 'hoster', 'family'] as const;

const SEVERITY_STYLES: Record<string, string> = {
  low: 'border-sev-low/30 bg-sev-low/10 text-sev-low',
  moderate: 'border-sev-medium/30 bg-sev-medium/10 text-sev-medium',
  high: 'border-sev-critical/30 bg-sev-critical/10 text-sev-critical',
};

const DIMENSION_LABELS: Record<Dimension, string> = {
  country: 'Country',
  as: 'Autonomous System',
  hoster: 'Hoster',
  family: 'Family',
};

export function ConcentrationPanel({
  data,
}: {
  data: Record<Dimension, ConcentrationResponse | null>;
}) {
  const [role, setRole] = useState<HhiRole>('consensus');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Concentration (HHI)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Herfindahl-Hirschman Index by role-weight share. An index of 10000/N means the weight
              is spread as if held by N equal operators:{' '}
              <span className="text-sev-low">&lt;1000 = 10+ operators</span> ·{' '}
              <span className="text-sev-medium">1000-2000 = 5 to 10</span> ·{' '}
              <span className="text-sev-critical">&gt;2000 = fewer than 5</span>.
            </p>
          </div>
          <SegmentedToggle
            value={role}
            onValueChange={(v) => setRole(v as HhiRole)}
            options={ROLES}
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="country">
          <TabsList>
            {DIMENSIONS.map((d) => (
              <TabsTrigger key={d} value={d}>
                {DIMENSION_LABELS[d]}
              </TabsTrigger>
            ))}
          </TabsList>
          {DIMENSIONS.map((d) => (
            <TabsContent key={d} value={d} className="mt-4">
              <FadeSwap key={role}>
                <DimensionView data={data[d]} dimension={d} role={role} />
              </FadeSwap>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DimensionView({
  data,
  dimension,
  role,
}: {
  data: ConcentrationResponse | null;
  dimension: Dimension;
  role: HhiRole;
}) {
  if (!data) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>;
  }

  const hhiValue = (data.hhi_by_role as HhiByRole)[role];
  const decent = (data.decentralization_by_role as DecentralizationByRole)[role];
  const severity = hhiSeverity(hhiValue);
  // Single pass for both role maxima instead of walking data.keys twice
  // (vercel-react-best-practices: js-combine-iterations).
  let maxGuard = 1;
  let maxExit = 1;
  for (const k of data.keys) {
    const guard = k.guard_weight_pct ?? 0;
    const exit = k.exit_weight_pct ?? 0;
    if (guard > maxGuard) maxGuard = guard;
    if (exit > maxExit) maxExit = exit;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
            HHI · {role}
          </p>
          <p className="font-mono text-3xl font-semibold tabular-nums">{formatHhi(hhiValue)}</p>
        </div>
        <span
          className={cn(
            'mb-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
            SEVERITY_STYLES[severity],
          )}
        >
          {hhiLabel(hhiValue)}
        </span>
        <div className="mb-0.5 flex gap-4 text-xs">
          <Metric label="Top-3" value={formatPct(decent.cr3 * 100, 1)} />
          <Metric label="Nakamoto" value={String(decent.nakamoto)} hint="entities to pass 50%" />
        </div>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          <p>
            {formatNumber(data.total_relays)} relays · {formatNumber(data.total_consensus_weight)}{' '}
            total weight
          </p>
          <p className="font-mono text-muted-foreground/70">
            {new Date(data.time).toISOString().slice(0, 19)}Z
          </p>
        </div>
      </div>

      <ConcentrationGauge hhi={hhiValue} severity={severity} />

      <div className="flex justify-end">
        <div className="flex w-44 justify-end gap-3 font-mono text-[10px] uppercase tracking-wide tabular-nums">
          <span className="text-role-guard/70">guard</span>
          <span className="text-muted-foreground/70">middle</span>
          <span className="text-role-exit/70">exit</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {data.keys.map((k) => {
          const guard = k.guard_weight_pct ?? 0;
          const exit = k.exit_weight_pct ?? 0;
          const middle = k.middle_weight_pct ?? 0;
          return (
            <BarRow
              key={k.key}
              variant="dual"
              gridCols="7rem 1fr auto"
              tone="bg-role-guard/70"
              fillClassName="rounded-sm"
              bar={guard / maxGuard}
              fillTitle={`guard ${formatPct(guard)}`}
              exitTick={exit / maxExit}
              exitTickTitle={`exit ${formatPct(exit)}`}
              label={
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium" title={k.key}>
                    {dimension === 'country'
                      ? k.key.toUpperCase()
                      : dimension === 'family'
                        ? (k.label ?? `${k.key.slice(0, 8)}…`)
                        : k.key}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(k.relay_count)} relays
                  </p>
                </div>
              }
              right={
                <div className="flex w-44 justify-end gap-3 font-mono text-xs tabular-nums">
                  <span title="guard share" className="text-role-guard">
                    {formatPct(guard)}
                  </span>
                  <span title="middle share" className="text-muted-foreground">
                    {formatPct(middle, 1)}
                  </span>
                  <span title="exit share" className="text-role-exit">
                    {formatPct(exit)}
                  </span>
                </div>
              }
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-role-guard/70" /> guard (bar)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 border-x border-role-exit bg-role-exit" /> exit
          (tick)
        </span>
        <span className="text-muted-foreground/70">
          bars scaled to the top share per role · hover for detail
        </span>
      </div>
    </div>
  );
}
