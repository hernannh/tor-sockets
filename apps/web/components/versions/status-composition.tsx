'use client';

import { formatNumber, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/**
 * Network version composition as a single full-width 100% stacked bar, toggled
 * between consensus weight and relay count. Replaces three disconnected thin
 * bars: seeing recommended | obsolete | experimental as one segmented whole is
 * the headline "how much of the network is on EOL" read.
 */
type Bucket = {
  status: string | null;
  relays: number;
  relays_pct: number;
  weight_pct: number;
};

// Fixed left-to-right order: the healthy segment leads, the EOL tail trails.
const ORDER = ['recommended', 'experimental', 'new', 'obsolete', 'unrecommended'];
const SEG: Record<string, { bar: string; text: string }> = {
  recommended: { bar: 'bg-sev-low', text: 'text-sev-low' },
  experimental: { bar: 'bg-sev-medium', text: 'text-sev-medium' },
  new: { bar: 'bg-sev-info', text: 'text-sev-info' },
  obsolete: { bar: 'bg-sev-critical', text: 'text-sev-critical' },
  unrecommended: { bar: 'bg-sev-critical', text: 'text-sev-critical' },
};

type Metric = 'weight' | 'relays';

export function StatusComposition({ buckets }: { buckets: Bucket[] }) {
  const [metric, setMetric] = useState<Metric>('weight');

  const sorted = [...buckets].sort((a, b) => {
    const ia = ORDER.indexOf(a.status ?? '');
    const ib = ORDER.indexOf(b.status ?? '');
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const pctOf = (b: Bucket) => (metric === 'weight' ? b.weight_pct : b.relays_pct);

  return (
    <div className="rounded-lg border border-border p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Network composition
        </p>
        <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
          {(['weight', 'relays'] as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn(
                'rounded px-2.5 py-1 font-medium capitalize transition-colors',
                metric === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex h-8 w-full overflow-hidden rounded-md border border-border">
        {sorted.map((b) => {
          const key = b.status ?? 'unknown';
          const pct = pctOf(b);
          if (pct <= 0) return null;
          return (
            <div
              key={key}
              className={cn('h-full', SEG[key]?.bar ?? 'bg-muted-foreground/40')}
              style={{ width: `${pct}%` }}
              title={`${key} - ${formatPct(pct)} (${formatNumber(b.relays)} relays)`}
            />
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {sorted.map((b) => {
          const key = b.status ?? 'unknown';
          return (
            <div key={key} className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'size-2.5 shrink-0 self-center rounded-sm',
                  SEG[key]?.bar ?? 'bg-muted-foreground/40',
                )}
              />
              <span className="text-sm capitalize">{key}</span>
              <span className={cn('font-mono text-sm font-semibold tabular-nums', SEG[key]?.text)}>
                {formatPct(pctOf(b))}
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatNumber(b.relays)} relays
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
