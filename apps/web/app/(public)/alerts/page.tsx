import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SEV,
  SEVERITY_ORDER,
  SEVERITY_RANK,
  type Severity,
  anomalyDetail,
  anomalyMeta,
  sevOf,
} from '@/lib/anomalies';
import {
  getAnomalySeverityCounts,
  getAnomalyTypeCounts,
  getRecentAlertEvents,
  getRecentAnomalies,
} from '@/lib/api/queries';
import { formatRelative } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { getDb } from '@tor-sockets/db';
import { AlertTriangle, Bell, CheckCircle2, Mail, Send, Webhook } from 'lucide-react';
import Link from 'next/link';

export const metadata = pageMetadata({
  title: 'Alerts & Anomalies',
  description:
    'Anomalies detected on the live Tor network - HHI jumps, Sybil clusters, rapid weight gains and consensus divergences - plus the alerts delivered for them.',
  path: '/alerts',
});

export const revalidate = 60;

const ANOMALY_PAGE_SIZE = 20;
const EVENT_PAGE_SIZE = 20;

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = new URLSearchParams();
  const raw = await searchParams;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
  }
  if (!sp.has('limit')) sp.set('limit', String(ANOMALY_PAGE_SIZE));
  const offset = Math.max(Number.parseInt(sp.get('offset') ?? '0', 10) || 0, 0);
  const limit =
    Number.parseInt(sp.get('limit') ?? String(ANOMALY_PAGE_SIZE), 10) || ANOMALY_PAGE_SIZE;
  const eventOffset = Math.max(Number.parseInt(sp.get('e_offset') ?? '0', 10) || 0, 0);
  const eventLimit =
    Number.parseInt(sp.get('e_limit') ?? String(EVENT_PAGE_SIZE), 10) || EVENT_PAGE_SIZE;

  const activeSeverity =
    typeof raw.severity === 'string' &&
    SEVERITY_RANK[raw.severity as keyof typeof SEVERITY_RANK] !== undefined
      ? raw.severity
      : null;
  const activeType = typeof raw.type === 'string' ? raw.type : null;

  const db = getDb(process.env.DATABASE_URL);
  const [anomalies, events, sevCountsMap, typeCountsMap] = await Promise.all([
    getRecentAnomalies(db, {
      limit,
      offset,
      severity: activeSeverity ?? undefined,
      type: activeType ?? undefined,
    }),
    getRecentAlertEvents(db, { limit: eventLimit, offset: eventOffset }),
    getAnomalySeverityCounts(db),
    getAnomalyTypeCounts(db),
  ]);

  const sevCounts = SEVERITY_ORDER.map((sev) => ({ sev, count: sevCountsMap[sev] ?? 0 }));
  const grandTotal = Object.values(sevCountsMap).reduce((a, b) => a + b, 0);
  const typeCounts = Object.entries(typeCountsMap)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const deliveredCount = events.events.filter((e) => e.delivered_to.length > 0).length;

  // Build a filter href preserving the other active filter, dropping pagination
  // offset (a new filter starts on page 1). null clears that filter.
  const filterHref = (patch: { severity?: string | null; type?: string | null }) => {
    const p = new URLSearchParams();
    const sev = patch.severity !== undefined ? patch.severity : activeSeverity;
    const typ = patch.type !== undefined ? patch.type : activeType;
    if (sev) p.set('severity', sev);
    if (typ) p.set('type', typ);
    if (typeof raw.e_offset === 'string') p.set('e_offset', raw.e_offset);
    const qs = p.toString();
    return qs ? `/alerts?${qs}` : '/alerts';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts & Anomalies"
        description="Automatic detector findings and rule-fired alert events, with delivery status to configured channels."
      />

      {/* Severity filter + delivery overview */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={filterHref({ severity: null })}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
            activeSeverity === null
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          <span className="font-mono text-base font-bold tabular-nums">{grandTotal}</span> All
        </Link>
        {sevCounts.map(({ sev, count }) => (
          <SeverityChip
            key={sev}
            sev={sev}
            count={count}
            active={activeSeverity === sev}
            href={filterHref({ severity: activeSeverity === sev ? null : sev })}
          />
        ))}
        <span className="ml-auto inline-flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2">
          <Bell className="size-4 text-primary" />
          <span className="font-mono text-base font-bold tabular-nums text-primary">
            {events.total}
          </span>
          <span className="text-xs text-muted-foreground">alerts</span>
          <span className="h-4 w-px bg-border" />
          <CheckCircle2
            className={cn('size-4', deliveredCount > 0 ? 'text-success' : 'text-muted-foreground')}
          />
          <span
            className={cn(
              'font-mono text-base font-bold tabular-nums',
              deliveredCount > 0 ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {deliveredCount}
          </span>
          <span className="text-xs text-muted-foreground">delivered</span>
        </span>
      </div>

      {/* Type filter */}
      {typeCounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Type</span>
          <Link
            href={filterHref({ type: null })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
              activeType === null
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            All types
          </Link>
          {typeCounts.map(({ type, count }) => {
            const isActive = activeType === type;
            return (
              <Link
                key={type}
                href={filterHref({ type: isActive ? null : type })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                  isActive
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {anomalyMeta(type).label}
                <span className="font-mono tabular-nums text-muted-foreground">{count}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Anomaly findings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4" /> Anomaly Findings
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {anomalies.total} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anomalies.anomalies.length === 0 ? (
            activeSeverity || activeType ? (
              <EmptyState
                icon="check"
                title="No anomalies match this filter"
                hint="Nothing at this severity/type. Try a different filter."
                cta={{ href: '/alerts', label: 'Clear filters' }}
              />
            ) : (
              <EmptyState
                icon="check"
                title="No anomalies detected"
                hint="The network looks healthy right now."
              />
            )
          ) : (
            <ul className="divide-y divide-border/50">
              {anomalies.anomalies.map((a) => {
                const sev = sevOf(a.severity);
                const s = SEV[sev];
                const meta = anomalyMeta(a.type);
                const Icon = meta.icon;
                const d = a.details as Record<string, unknown>;
                const detail = anomalyDetail(a.type, d);
                const fp = typeof d.fingerprint === 'string' ? d.fingerprint : null;
                return (
                  <li
                    key={a.id}
                    className={cn(
                      'relative py-3 pl-4',
                      'before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[2.5px] before:rounded-full',
                      s.bar,
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={cn('mt-0.5 size-4 shrink-0', s.text)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{meta.label}</p>
                          <time className="shrink-0 font-mono text-xs text-muted-foreground/70">
                            {formatRelative(a.detected_at)}
                          </time>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-foreground/80">
                          {detail.primary}
                        </p>
                        {detail.secondary ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {detail.secondary}
                          </p>
                        ) : null}
                      </div>
                      {fp && detail.href ? (
                        <Link
                          href={detail.href}
                          className="shrink-0 font-mono text-xs text-primary hover:underline"
                          title={fp}
                        >
                          {fp.slice(0, 8)}…
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {anomalies.total > limit ? (
        <Pagination
          basePath="/alerts"
          searchParams={Object.fromEntries(sp.entries())}
          offset={offset}
          limit={limit}
          total={anomalies.total}
        />
      ) : null}

      {/* Alert events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="size-4" /> Alert Events
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {events.total} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.events.length === 0 ? (
            <EmptyState
              icon="bell"
              title="No alert events yet"
              hint="Rules fire after each consensus cycle - configure them in the operator panel."
              cta={{ href: '/operator', label: 'Open operator panel' }}
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {events.events.map((e) => {
                const sev = sevOf((e.payload.severity as string) ?? 'info');
                const s = SEV[sev];
                const title = (e.payload.title as string) ?? e.rule_name;
                return (
                  <li
                    key={e.id}
                    className={cn(
                      'relative py-3 pl-4',
                      'before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[2.5px] before:rounded-full',
                      s.bar,
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Bell className={cn('mt-0.5 size-4 shrink-0', s.text)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{title}</p>
                          <time className="shrink-0 font-mono text-xs text-muted-foreground/70">
                            {formatRelative(e.triggered_at)}
                          </time>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {e.rule_name}
                        </p>
                      </div>
                      {e.delivered_to.length > 0 ? (
                        <div className="flex shrink-0 items-center gap-1">
                          {e.delivered_to.map((ch) => (
                            <ChannelChip key={ch} channel={ch} />
                          ))}
                        </div>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground/60">
                          no channels
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {events.total > eventLimit ? (
        <Pagination
          basePath="/alerts"
          searchParams={Object.fromEntries(sp.entries())}
          offset={eventOffset}
          limit={eventLimit}
          total={events.total}
          offsetParam="e_offset"
          limitParam="e_limit"
        />
      ) : null}
    </div>
  );
}

function SeverityChip({
  sev,
  count,
  active,
  href,
}: {
  sev: Severity;
  count: number;
  active: boolean;
  href: string;
}) {
  const s = SEV[sev];
  const has = count > 0;
  const cls = cn(
    'inline-flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
    active
      ? cn(s.chip, 'ring-1 ring-current')
      : has
        ? cn(s.chip, 'hover:brightness-125')
        : 'border-border/40 bg-card/20 opacity-50',
  );
  const body = (
    <>
      <span className={cn('size-2 rounded-full', s.solid)} />
      <span
        className={cn(
          'font-mono text-base font-bold tabular-nums',
          has ? s.text : 'text-muted-foreground',
        )}
      >
        {count}
      </span>
      <span className="text-xs text-muted-foreground capitalize">{sev}</span>
    </>
  );
  return has ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

function ChannelChip({ channel }: { channel: string }) {
  const [kind] = channel.split(':');
  const Icon = kind === 'email' ? Mail : kind === 'telegram' ? Send : Webhook;
  return (
    <span
      title={channel}
      className="inline-flex size-5 items-center justify-center rounded border border-success/30 bg-success/10 text-success"
    >
      <Icon className="size-3" />
    </span>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  cta,
}: {
  icon: 'check' | 'bell';
  title: string;
  hint: string;
  cta?: { href: string; label: string };
}) {
  const Icon = icon === 'check' ? CheckCircle2 : Bell;
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary hover:text-foreground"
        >
          {cta.label} →
        </Link>
      ) : null}
    </div>
  );
}
