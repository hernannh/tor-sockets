import { HeroCircuit } from '@/components/landing/hero-circuit';
import { CountUp } from '@/components/motion/count-up';
import { Button } from '@/components/ui/button';
import { ConcentrationGauge } from '@/components/viz/concentration-gauge';
import { formatHhi, hhiSeverity } from '@/lib/format';
import { ArrowRight, Network } from 'lucide-react';
import Link from 'next/link';

/**
 * Landing hero. The animated circuit (signature) sits beside a live gauge so
 * the brand's central question - "who controls your circuit?" - is grounded in
 * real telemetry the moment the page loads.
 */
export function Hero({
  relaysRunning,
  hhi,
}: {
  relaysRunning: number;
  hhi: number | null;
}) {
  const severity = hhi != null ? hhiSeverity(hhi) : 'low';

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(60% 70% at 75% 20%, color-mix(in oklch, var(--primary) 22%, transparent), transparent)',
        }}
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
        <div className="flex flex-col gap-6">
          <span className="font-condensed text-xs font-medium tracking-[0.2em] text-primary uppercase">
            Federated Tor network monitor
          </span>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Who controls your circuit?
          </h1>
          <p className="max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            Tor-Sockets measures, in real time, how much guard and exit weight concentrates in a
            single country, AS, or operator - and warns you the moment the balance shifts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Open the dashboard <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/api/docs">
                <Network className="size-4" /> Browse the API
              </Link>
            </Button>
          </div>
          {relaysRunning > 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              <CountUp value={relaysRunning} /> relays running · live consensus
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <HeroCircuit />
          {hhi != null ? (
            <div className="rounded-xl border border-border bg-card/50 p-5 backdrop-blur-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-condensed text-xs tracking-[0.12em] text-muted-foreground uppercase">
                  Network HHI · Autonomous Systems
                </span>
                <span className="font-mono text-2xl font-semibold tabular-nums">
                  {formatHhi(hhi)}
                </span>
              </div>
              <ConcentrationGauge hhi={hhi} severity={severity} className="mt-4" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
