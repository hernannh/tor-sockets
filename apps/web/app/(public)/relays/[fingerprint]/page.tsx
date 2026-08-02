import { OperatorContact } from '@/components/operator-contact';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getRelayByFingerprint } from '@/lib/api/queries';
import {
  formatBandwidth,
  formatDateTime,
  formatNumber,
  formatPct,
  formatRelative,
} from '@/lib/format';
import { countryFlag, countryName } from '@/lib/geo';
import { FLAG_TONE } from '@/lib/relay-visuals';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import type { RelayDetail } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}): Promise<Metadata> {
  const { fingerprint } = await params;
  if (!/^[0-9A-Fa-f]{40}$/.test(fingerprint)) return { title: 'Relay' };
  const db = getDb(process.env.DATABASE_URL);
  const relay = await getRelayByFingerprint(db, fingerprint);
  if (!relay) return { title: 'Relay', robots: { index: false, follow: true } };
  const where = [countryName(relay.country), relay.as_name].filter(Boolean).join(', ');
  return pageMetadata({
    title: `${relay.nickname} (${relay.fingerprint.slice(0, 8)})`,
    description: `Tor relay ${relay.nickname}${where ? ` in ${where}` : ''}: flags, consensus weight, bandwidth, exit policy and operator contact, from the signed consensus.`,
    path: `/relays/${relay.fingerprint}`,
  });
}

export default async function RelayDetailPage({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}) {
  const { fingerprint } = await params;
  if (!/^[0-9A-Fa-f]{40}$/.test(fingerprint)) notFound();

  const db = getDb(process.env.DATABASE_URL);
  const relay = await getRelayByFingerprint(db, fingerprint);
  if (!relay) notFound();

  const flag = countryFlag(relay.country);
  const overload = Boolean(relay.overload_general_timestamp);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/relays', label: 'Relay Directory' }}
        align="start"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {flag ? (
              <span aria-hidden="true" className="text-2xl leading-none">
                {flag}
              </span>
            ) : null}
            {relay.nickname}
            <StatusChip running={relay.running} />
          </span>
        }
        description={
          <>
            <span className="block break-all font-mono text-sm">{relay.fingerprint}</span>
            <span className="mt-1 block text-xs">
              {relay.country ? (
                <>
                  {countryName(relay.country)} ({relay.country.toUpperCase()}) ·{' '}
                </>
              ) : null}
              First seen {formatRelative(relay.first_seen)} · last seen{' '}
              {formatRelative(relay.last_seen)}
              {relay.last_restarted ? ` · restarted ${formatRelative(relay.last_restarted)}` : ''}
            </span>
          </>
        }
        aside={
          <a
            href={`https://metrics.torproject.org/rs.html#details/${relay.fingerprint}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:bg-secondary hover:text-foreground"
          >
            Relay Search <ExternalLink className="size-3" />
          </a>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {relay.flags.map((f) => (
          <Badge
            key={f}
            variant="outline"
            className={cn('px-2 py-0.5', FLAG_TONE[f] ?? 'text-muted-foreground')}
          >
            {f}
          </Badge>
        ))}
      </div>

      {overload ? (
        <div className="flex items-center gap-2 rounded-lg border border-sev-medium/30 bg-sev-medium/10 px-4 py-2.5 text-sm text-sev-medium">
          <AlertTriangle className="size-4 shrink-0" />
          <span>Overloaded (general) since {formatDateTime(relay.overload_general_timestamp)}</span>
        </div>
      ) : null}

      <RoleProbabilities relay={relay} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Consensus weight" value={formatNumber(relay.consensus_weight)} />
        <Stat
          label="CW fraction"
          value={
            relay.consensus_weight_fraction ? formatPct(relay.consensus_weight_fraction * 100) : '-'
          }
        />
        <Stat label="Advertised BW" value={formatBandwidth(relay.advertised_bandwidth)} />
        <Stat label="Observed BW" value={formatBandwidth(relay.observed_bandwidth)} />
        <Stat
          label="Measured"
          value={relay.measured === null ? '-' : relay.measured ? 'yes' : 'no'}
        />
        <Stat
          label="Version"
          value={relay.version ?? '-'}
          hint={
            relay.recommended_version === null
              ? undefined
              : relay.recommended_version
                ? 'recommended'
                : 'not recommended'
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Location &amp; network</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="Country">
              {relay.country ? (
                <span className="flex items-center gap-1.5">
                  {flag ? <span aria-hidden="true">{flag}</span> : null}
                  <span>{countryName(relay.country)}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    ({relay.country.toUpperCase()})
                  </span>
                </span>
              ) : (
                '-'
              )}
            </Row>
            <Row label="AS" mono>
              {relay.as_name ?? relay.as_number ?? '-'}
            </Row>
            <Row label="Platform" mono>
              <span className="break-all">{relay.platform ?? '-'}</span>
            </Row>
            <Row label="Contact" mono>
              <OperatorContact contact={relay.contact} showBadge />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Addresses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="OR" mono>
              <span className="break-all">{relay.or_addresses.join(', ') || '-'}</span>
            </Row>
            <Row label="Exit" mono>
              <span className="break-all">{relay.exit_addresses.join(', ') || '-'}</span>
            </Row>
            <Row label="Dir" mono>
              {relay.dir_address ?? '-'}
            </Row>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Family</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <FamilyList title="Effective" family={relay.effective_family} />
          <FamilyList title="Alleged" family={relay.alleged_family} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusChip({ running }: { running: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs',
        running
          ? 'border-status-running/30 bg-status-running/10 text-status-running'
          : 'border-status-stopped/30 bg-status-stopped/10 text-status-stopped',
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', running ? 'bg-status-running' : 'bg-status-stopped')}
      />
      {running ? 'running' : 'stopped'}
    </span>
  );
}

function RoleProbabilities({ relay }: { relay: RelayDetail }) {
  const roles = [
    {
      label: 'Guard',
      value: relay.guard_probability,
      bar: 'bg-role-guard',
      text: 'text-role-guard',
    },
    {
      label: 'Middle',
      value: relay.middle_probability,
      bar: 'bg-role-middle',
      text: 'text-role-middle',
    },
    { label: 'Exit', value: relay.exit_probability, bar: 'bg-role-exit', text: 'text-role-exit' },
  ];
  const max = Math.max(...roles.map((r) => r.value ?? 0), 0.0001);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Role probabilities</CardTitle>
        <p className="text-xs text-muted-foreground">
          Selection share for each circuit position. Bars are scaled to this relay's dominant role;
          the number is the absolute probability.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {roles.map((r) => {
          const v = r.value ?? 0;
          const w = (v / max) * 100;
          return (
            <div key={r.label} className="flex items-center gap-3">
              <span className="w-14 font-condensed text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                {r.label}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full', r.bar)}
                  style={{ width: `${w}%` }}
                />
              </span>
              <span className={cn('w-14 text-right font-mono text-xs tabular-nums', r.text)}>
                {formatPct(v * 100, 2)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="h-0.5 w-full bg-primary/40" />
      <CardContent className="px-4 py-3.5">
        <p className="font-condensed text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : ''}>{children}</span>
    </div>
  );
}

function FamilyList({ title, family }: { title: string; family: string[] }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{title}</span>
      <div className="flex flex-wrap gap-1">
        {family.length === 0 ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          family.map((f) =>
            f.startsWith('$') ? (
              <Link
                key={f}
                href={`/relays/${f.slice(1)}`}
                className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-secondary/70 hover:text-primary"
              >
                {f.slice(1, 8)}…{f.slice(-3)}
              </Link>
            ) : (
              <span
                key={f}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
              >
                {f}
              </span>
            ),
          )
        )}
      </div>
    </div>
  );
}
