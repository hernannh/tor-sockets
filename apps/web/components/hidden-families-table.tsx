'use client';

import { OperatorContact } from '@/components/operator-contact';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber, formatPct } from '@/lib/format';
import { countryFlag, countryName } from '@/lib/geo';
import { cn } from '@/lib/utils';
import type { HiddenFamilyCluster } from '@tor-sockets/api-contract';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useState } from 'react';

function riskTone(risk: number): string {
  if (risk >= 0.01) return 'text-sev-critical';
  if (risk >= 0.003) return 'text-sev-high';
  if (risk >= 0.001) return 'text-sev-medium';
  return 'text-muted-foreground';
}

export function HiddenFamiliesTable({ clusters }: { clusters: HiddenFamilyCluster[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-6" />
          <TableHead>Operator (contact)</TableHead>
          <TableHead className="text-right">Relays</TableHead>
          <TableHead className="text-right">Declared / undeclared</TableHead>
          <TableHead className="text-right">Guard</TableHead>
          <TableHead className="text-right">Exit</TableHead>
          <TableHead className="text-right">Deanon risk</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clusters.map((c) => {
          const isOpen = open === c.contact;
          return (
            <Fragment key={c.contact}>
              <TableRow
                className="cursor-pointer"
                onClick={() => setOpen(isOpen ? null : c.contact)}
              >
                <TableCell>
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </TableCell>
                <TableCell>
                  <OperatorContact
                    contact={c.contact}
                    showBadge
                    className="max-w-[20rem] text-sm"
                  />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(c.relays)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {c.declared_families} /{' '}
                  <span className="text-sev-high">{c.undeclared_relays}</span>
                </TableCell>
                <TableCell className="text-right font-mono text-role-guard tabular-nums">
                  {formatPct(c.guard_pct)}
                </TableCell>
                <TableCell className="text-right font-mono text-role-exit tabular-nums">
                  {formatPct(c.exit_pct)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-mono font-semibold tabular-nums',
                    riskTone(c.deanon_risk),
                  )}
                >
                  {formatPct(c.deanon_risk * 100, 3)}
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableCell />
                  <TableCell colSpan={6} className="py-4 align-top whitespace-normal">
                    <ClusterDetail c={c} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ClusterDetail({ c }: { c: HiddenFamilyCluster }) {
  return (
    <div className="grid gap-x-8 gap-y-6 py-1 text-sm md:grid-cols-2">
      <div className="space-y-3">
        <p className="font-medium text-foreground">Why it&apos;s flagged</p>
        <p className="text-muted-foreground">
          This operator runs <strong>{formatNumber(c.relays)}</strong> relays split into{' '}
          <strong>{c.declared_families}</strong> declared{' '}
          {c.declared_families === 1 ? 'family' : 'families'}
          {c.declared_family_sizes.length > 0 && <> (sizes {c.declared_family_sizes.join(', ')})</>}
          {c.undeclared_relays > 0 && (
            <>
              {' '}
              plus <strong>{c.undeclared_relays}</strong> undeclared
            </>
          )}
          . Because they are not <em>one</em> declared family, Tor path selection can place a{' '}
          <span className="text-role-guard">guard</span> from one and an{' '}
          <span className="text-role-exit">exit</span> from another in the same circuit.
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          deanon_risk = guard {formatPct(c.guard_pct)} × exit {formatPct(c.exit_pct)} ={' '}
          <span className={cn('font-semibold', riskTone(c.deanon_risk))}>
            {formatPct(c.deanon_risk * 100, 3)}
          </span>{' '}
          of circuits
        </p>
        <p className="text-xs text-muted-foreground/70">
          {c.verified ? (
            <>
              <span className="text-sev-low">Contact is domain-verified (proof:*-rsa)</span> - a
              self-identified operator, not an anonymous Sybil.{' '}
            </>
          ) : null}
          A shared contact is a strong operator signal, not proof of malicious intent - this is a
          structural path-selection observation. The operator could declare all relays as one family
          to remove the intra-operator risk.
        </p>
      </div>

      <div className="space-y-3">
        <p className="font-medium text-foreground">
          AS spread ({c.as_breakdown.length}) · countries ({c.countries.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {c.as_breakdown.slice(0, 12).map((a) => (
            <span
              key={a.as_number}
              className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px]"
            >
              {a.as_number} · {formatNumber(a.relays)}
            </span>
          ))}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground uppercase">
          {c.countries.map((cc) => (
            <span key={cc} className="inline-flex items-center gap-1" title={countryName(cc)}>
              <span className="not-italic">{countryFlag(cc)}</span>
              {cc}
            </span>
          ))}
        </p>
        <div className="flex flex-wrap gap-4 pt-1">
          <Link href="/correlation?dimension=as" className="text-sev-low hover:underline">
            See in Correlation risk →
          </Link>
          <Link href="/correlation?dimension=hoster" className="text-sev-low hover:underline">
            By hoster →
          </Link>
        </div>
      </div>
    </div>
  );
}
