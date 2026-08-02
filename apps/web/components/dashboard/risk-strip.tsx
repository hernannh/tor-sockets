import { cn } from '@/lib/utils';
import Link from 'next/link';

/**
 * Risk & health summary strip for the dashboard: one card per deep-dive page
 * (concentration / correlation / hidden families / versions), each surfacing
 * that page's headline number with a threshold-coloured status and linking
 * through. Turns the dashboard from a siloed snapshot into the app's hub.
 */
export type SignalTone = 'good' | 'warn' | 'bad';

const TONE: Record<SignalTone, { dot: string; value: string }> = {
  good: { dot: 'bg-sev-low', value: 'text-sev-low' },
  warn: { dot: 'bg-sev-medium', value: 'text-sev-medium' },
  bad: { dot: 'bg-sev-critical', value: 'text-sev-critical' },
};

export interface RiskSignal {
  href: string;
  label: string;
  value: string;
  sub: string;
  tone: SignalTone;
}

export function RiskStrip({ signals }: { signals: RiskSignal[] }) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {signals.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="group rounded-lg border border-border p-4 transition-colors hover:border-muted-foreground/40 hover:bg-muted/20"
        >
          <div className="flex items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', TONE[s.tone].dot)} />
            <span className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {s.label}
            </span>
            <span className="ml-auto text-muted-foreground/50 transition-colors group-hover:text-foreground">
              →
            </span>
          </div>
          <p
            className={cn('mt-1 font-mono text-xl font-semibold tabular-nums', TONE[s.tone].value)}
          >
            {s.value}
          </p>
          <p className="truncate text-xs text-muted-foreground">{s.sub}</p>
        </Link>
      ))}
    </div>
  );
}
