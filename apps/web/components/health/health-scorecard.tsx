'use client';

import { cn } from '@/lib/utils';
import { Tabs as TabsPrimitive } from 'radix-ui';

/**
 * Health overview: one signal tile per dimension (overload / IPv6 / bandwidth /
 * exit) with a threshold-coloured status. The tiles are the page's tab list -
 * the "is the network healthy right now" read and the section switcher are the
 * same control, so only one dimension's detail is on screen at a time instead
 * of four stacked in a single long scroll.
 *
 * Must sit inside a `Tabs` root whose values match `signal.value`.
 */
export type SignalTone = 'good' | 'warn' | 'bad';

const TONE: Record<SignalTone, { dot: string; value: string }> = {
  good: { dot: 'bg-sev-low', value: 'text-sev-low' },
  warn: { dot: 'bg-sev-medium', value: 'text-sev-medium' },
  bad: { dot: 'bg-sev-critical', value: 'text-sev-critical' },
};

export interface HealthSignal {
  value: string;
  label: string;
  metric: string;
  sub: string;
  tone: SignalTone;
}

export function HealthScorecard({ signals }: { signals: HealthSignal[] }) {
  return (
    <TabsPrimitive.List className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {signals.map((s) => (
        <TabsPrimitive.Trigger
          key={s.value}
          value={s.value}
          className={cn(
            'rounded-lg border border-border p-4 text-left transition-colors',
            'hover:border-muted-foreground/40 hover:bg-muted/20',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'data-[state=active]:border-primary/50 data-[state=active]:bg-primary/5',
          )}
        >
          <div className="flex items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', TONE[s.tone].dot)} />
            <span className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {s.label}
            </span>
          </div>
          <p
            className={cn('mt-1 font-mono text-2xl font-semibold tabular-nums', TONE[s.tone].value)}
          >
            {s.metric}
          </p>
          <p className="text-xs text-muted-foreground">{s.sub}</p>
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}
