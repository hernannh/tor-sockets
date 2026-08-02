'use client';

import { Badge } from '@/components/ui/badge';
import { BarRow } from '@/components/viz/bar-row';
import { formatNumber, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

/**
 * Top versions grouped by release branch (0.4.9 / 0.4.8 / 0.5.x). The flat list
 * hid the migration story - grouping shows the current wave, the EOL tail, and
 * the experimental fringe as distinct blocks with subtotals. Each row carries
 * both relay count and weight so the "many small relays vs few heavy ones" split
 * is visible. Not-recommended rows get a red accent.
 */
type Entry = {
  version: string;
  recommended: boolean | null;
  relays: number;
  relays_pct: number;
  weight_pct: number;
};

type Klass = 'recommended' | 'experimental' | 'obsolete';

type Branch = {
  key: string;
  versions: Entry[];
  relays: number;
  relays_pct: number;
  weight_pct: number;
  klass: Klass;
};

/** major.minor.patch prefix, e.g. "0.4.9.11" -> "0.4.9", "0.5.0.0-alpha" -> "0.5.0". */
function branchOf(version: string): string {
  const parts = version.split('.');
  return parts.length >= 3 ? parts.slice(0, 3).join('.') : version;
}

// The top-versions payload only carries a `recommended` bool, not the raw
// version_status. Distinguish a pre-release (experimental) from a truly obsolete
// EOL version by the release suffix so 0.5.x-alpha isn't mislabelled as EOL.
const PRERELEASE = /-(alpha|beta|rc|dev)/i;
function classify(v: Entry): Klass {
  if (v.recommended) return 'recommended';
  return PRERELEASE.test(v.version) ? 'experimental' : 'obsolete';
}

const KLASS: Record<Klass, { label: string; text: string; bar: string; barSoft: string }> = {
  recommended: {
    label: 'recommended',
    text: 'text-sev-low',
    bar: 'bg-sev-low/60',
    barSoft: 'bg-sev-low/50',
  },
  experimental: {
    label: 'experimental',
    text: 'text-sev-medium',
    bar: 'bg-sev-medium/60',
    barSoft: 'bg-sev-medium/50',
  },
  obsolete: {
    label: 'obsolete / EOL',
    text: 'text-sev-critical',
    bar: 'bg-sev-critical/60',
    barSoft: 'bg-sev-critical/50',
  },
};

const GRID = '10rem 9rem 1fr 8rem 5rem';

export function VersionBranches({ versions }: { versions: Entry[] }) {
  const branches = useMemo<Branch[]>(() => {
    const map = new Map<string, Branch>();
    for (const v of versions) {
      const key = branchOf(v.version);
      const b =
        map.get(key) ??
        ({
          key,
          versions: [],
          relays: 0,
          relays_pct: 0,
          weight_pct: 0,
          klass: 'obsolete',
        } as Branch);
      b.versions.push(v);
      b.relays += v.relays;
      b.relays_pct += v.relays_pct;
      b.weight_pct += v.weight_pct;
      map.set(key, b);
    }
    const list = [...map.values()];
    for (const b of list) {
      b.versions.sort((a, c) => c.weight_pct - a.weight_pct);
      // Branch class = its best member: recommended wins, else experimental, else obsolete.
      const classes = b.versions.map(classify);
      b.klass = classes.includes('recommended')
        ? 'recommended'
        : classes.includes('experimental')
          ? 'experimental'
          : 'obsolete';
    }
    return list.sort((a, c) => c.weight_pct - a.weight_pct);
  }, [versions]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const maxBranchWeight = Math.max(...branches.map((b) => b.weight_pct), 1);
  const maxVersionWeight = Math.max(...versions.map((v) => v.weight_pct), 1);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div
        className="grid items-center gap-3 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground"
        style={{ gridTemplateColumns: GRID }}
      >
        <span>Version</span>
        <span>Status</span>
        <span>Weight share</span>
        <span className="text-right">Relays</span>
        <span className="text-right">Weight %</span>
      </div>

      {branches.map((b) => {
        const isOpen = !collapsed.has(b.key);
        return (
          <div key={b.key} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => toggle(b.key)}
              className="grid w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/20"
              style={{ gridTemplateColumns: GRID }}
            >
              <span className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform',
                    !isOpen && '-rotate-90',
                  )}
                />
                {b.key}
              </span>
              <span>
                <Badge variant="outline" className={cn(KLASS[b.klass].text, 'border-current/30')}>
                  {KLASS[b.klass].label}
                </Badge>
              </span>
              <BarRow
                bar={b.weight_pct / maxBranchWeight}
                tone={KLASS[b.klass].bar}
                trackClassName="h-3.5"
              />
              <span className="text-right font-mono text-sm tabular-nums">
                {formatNumber(b.relays)}
                <span className="ml-1 text-xs text-muted-foreground">
                  {formatPct(b.relays_pct)}
                </span>
              </span>
              <span className="text-right font-mono text-sm font-semibold tabular-nums">
                {formatPct(b.weight_pct)}
              </span>
            </button>

            {isOpen &&
              b.versions.map((v) => {
                const vk = classify(v);
                return (
                  <div
                    key={`${v.version}-${v.recommended}`}
                    className={cn(
                      'grid items-center gap-3 border-t border-border/50 py-2 pr-4 pl-4',
                      vk === 'obsolete'
                        ? 'border-l-2 border-l-sev-critical/60 bg-sev-critical/[0.03]'
                        : 'border-l-2 border-l-transparent',
                    )}
                    style={{ gridTemplateColumns: GRID }}
                  >
                    <span className="pl-5 font-mono text-sm text-muted-foreground">
                      {v.version}
                    </span>
                    <span>
                      <Badge
                        variant="outline"
                        className={cn(KLASS[vk].text, 'border-current/25 text-[10px]')}
                      >
                        {KLASS[vk].label}
                      </Badge>
                    </span>
                    <BarRow
                      bar={v.weight_pct / maxVersionWeight}
                      tone={KLASS[vk].barSoft}
                      trackClassName="h-3"
                    />
                    <span className="text-right font-mono text-xs tabular-nums">
                      {formatNumber(v.relays)}
                      <span className="ml-1 text-muted-foreground">{formatPct(v.relays_pct)}</span>
                    </span>
                    <span className="text-right font-mono text-sm tabular-nums">
                      {formatPct(v.weight_pct)}
                    </span>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
