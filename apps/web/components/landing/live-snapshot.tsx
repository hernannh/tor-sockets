import { CountUp } from '@/components/motion/count-up';
import { formatCompact } from '@/lib/format';
import type { StatsResponse } from '@tor-sockets/api-contract';

/**
 * A "social proof" bar built from real telemetry rather than customer logos -
 * the product is its data, so the live snapshot is the proof. Server-rendered
 * from the same ISR fetch as the dashboard.
 */
export function LiveSnapshot({ stats }: { stats: StatsResponse }) {
  const items = [
    { label: 'Relays running', value: <CountUp value={stats.relays_running} /> },
    { label: 'Consensus weight', value: formatCompact(stats.consensus_weight_sum) },
    { label: 'Countries', value: <CountUp value={stats.countries} /> },
    { label: 'Autonomous systems', value: <CountUp value={stats.autonomous_systems} /> },
  ];

  return (
    <section className="border-b border-border bg-card/30">
      <div className="mx-auto grid max-w-7xl grid-cols-2 px-6 lg:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={`flex flex-col gap-1 py-6 ${i > 0 ? 'lg:border-l lg:border-border lg:pl-6' : ''} lg:pr-6`}
          >
            <span className="font-condensed text-xs tracking-[0.12em] text-muted-foreground uppercase">
              {it.label}
            </span>
            <span className="font-mono text-2xl font-semibold tabular-nums">{it.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
