import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SEV, anomalyDetail, anomalyMeta, sevOf } from '@/lib/anomalies';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AnomalyFeedItem } from '@tor-sockets/api-contract';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export function AnomalyWidget({ anomalies }: { anomalies: AnomalyFeedItem[] }) {
  const count = anomalies.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Recent Anomalies
          {count > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
          <Link
            href="/alerts"
            className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            view all →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="size-5" />
            </span>
            <p className="text-sm font-medium">No anomalies detected</p>
            <p className="text-xs text-muted-foreground">The network looks healthy right now.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {anomalies.slice(0, 8).map((a) => {
              const sev = sevOf(a.severity);
              const s = SEV[sev];
              const meta = anomalyMeta(a.type);
              const Icon = meta.icon;
              const detail = anomalyDetail(a.type, a.details as Record<string, unknown>);
              return (
                <li
                  key={a.id}
                  className={cn(
                    'relative py-2.5 pl-3.5',
                    'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[2px] before:rounded-full',
                    s.bar,
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className={cn('mt-0.5 size-4 shrink-0', s.text)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                          <span className="truncate">{meta.label}</span>
                          <span
                            className={cn(
                              'shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase',
                              s.chip,
                              s.text,
                            )}
                          >
                            {sev}
                          </span>
                        </p>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground/70">
                          {formatRelative(a.detected_at)}
                        </time>
                      </div>
                      {detail.href ? (
                        <Link
                          href={detail.href}
                          className="mt-0.5 block truncate text-xs text-muted-foreground hover:text-foreground"
                        >
                          {detail.primary} <span className="text-primary">→</span>
                        </Link>
                      ) : (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {detail.primary}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
