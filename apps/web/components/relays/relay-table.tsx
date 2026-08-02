import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarRow } from '@/components/viz/bar-row';
import { formatNumber, formatPct } from '@/lib/format';
import { countryFlag, countryName } from '@/lib/geo';
import { FLAG_TONE } from '@/lib/relay-visuals';
import { cn } from '@/lib/utils';
import type { RelaySummary } from '@tor-sockets/api-contract';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

type SortField =
  | 'consensus_weight'
  | 'guard_probability'
  | 'exit_probability'
  | 'country'
  | 'nickname';
type SortOrder = 'asc' | 'desc';

function sortHref(
  field: SortField,
  current: SortField,
  currentOrder: SortOrder,
  params: Record<string, string | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && k !== 'offset') sp.set(k, v);
  }
  // Toggle direction when re-clicking the active field; otherwise default to desc.
  const nextOrder: SortOrder = field === current && currentOrder === 'desc' ? 'asc' : 'desc';
  sp.set('sort', field);
  sp.set('order', nextOrder);
  return `/relays?${sp.toString()}`;
}

export function RelayTable({
  relays,
  sort = 'consensus_weight',
  order = 'desc',
  queryParams = {},
}: {
  relays: RelaySummary[];
  sort?: SortField;
  order?: SortOrder;
  queryParams?: Record<string, string | undefined>;
}) {
  if (relays.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No relays match these filters.
      </div>
    );
  }

  // Probabilities are fractions (0-1) and tiny in absolute terms; scale the
  // mini-bars relative to the page max so the bars stay readable & comparable.
  const maxGuard = Math.max(...relays.map((r) => r.guard_probability ?? 0), 0.0001);
  const maxExit = Math.max(...relays.map((r) => r.exit_probability ?? 0), 0.0001);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHead
              field="nickname"
              label="Relay"
              current={sort}
              order={order}
              params={queryParams}
              className="w-[22%]"
            />
            <TableHead className="w-[4.5rem]">Status</TableHead>
            <SortHead
              field="country"
              label="Country"
              current={sort}
              order={order}
              params={queryParams}
              className="hidden w-[15%] sm:table-cell"
            />
            <TableHead className="hidden lg:table-cell">AS</TableHead>
            <SortHead
              field="consensus_weight"
              label="CW"
              current={sort}
              order={order}
              params={queryParams}
              align="right"
            />
            <SortHead
              field="guard_probability"
              label="Guard"
              current={sort}
              order={order}
              params={queryParams}
              align="right"
              className="hidden w-[8.5rem] md:table-cell"
            />
            <SortHead
              field="exit_probability"
              label="Exit"
              current={sort}
              order={order}
              params={queryParams}
              align="right"
              className="hidden w-[8.5rem] md:table-cell"
            />
            <TableHead className="hidden w-[15%] xl:table-cell">Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {relays.map((r) => {
            const flag = countryFlag(r.country);
            return (
              <TableRow key={r.fingerprint} className="group">
                <TableCell className="font-medium">
                  <Link href={`/relays/${r.fingerprint}`} className="flex flex-col gap-0.5">
                    <span className="truncate text-foreground group-hover:text-primary">
                      {r.nickname}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.fingerprint.slice(0, 8)}…{r.fingerprint.slice(-4)}
                    </span>
                  </Link>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium',
                      r.running
                        ? 'border-status-running/30 bg-status-running/10 text-status-running'
                        : 'border-status-stopped/30 bg-status-stopped/10 text-status-stopped',
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        r.running ? 'bg-status-running' : 'bg-status-stopped',
                      )}
                    />
                    {r.running ? 'up' : 'down'}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="flex items-center gap-1.5">
                    {flag ? (
                      <span aria-hidden="true" className="text-sm leading-none">
                        {flag}
                      </span>
                    ) : null}
                    <span className="truncate text-xs" title={r.country_name ?? r.country ?? ''}>
                      {r.country_name ?? countryName(r.country) ?? '-'}
                    </span>
                  </span>
                </TableCell>
                <TableCell
                  className="hidden max-w-[12rem] truncate text-xs text-muted-foreground lg:table-cell"
                  title={r.as_name ?? ''}
                >
                  {r.as_name ?? r.as_number ?? '-'}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(r.consensus_weight)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <BarRow
                    variant="cell"
                    tone="guard"
                    bar={maxGuard > 0 ? (r.guard_probability ?? 0) / maxGuard : 0}
                    value={formatPct((r.guard_probability ?? 0) * 100, 2)}
                  />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <BarRow
                    variant="cell"
                    tone="exit"
                    bar={maxExit > 0 ? (r.exit_probability ?? 0) / maxExit : 0}
                    value={formatPct((r.exit_probability ?? 0) * 100, 2)}
                  />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {r.flags
                      .filter((f) => FLAG_TONE[f])
                      .slice(0, 4)
                      .map((f) => (
                        <Badge
                          key={f}
                          variant="outline"
                          className={cn('px-1.5 py-0 text-[10px]', FLAG_TONE[f])}
                        >
                          {f}
                        </Badge>
                      ))}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SortHead({
  field,
  label,
  current,
  order,
  params,
  align = 'left',
  className,
}: {
  field: SortField;
  label: string;
  current: SortField;
  order: SortOrder;
  params: Record<string, string | undefined>;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = current === field;
  const Icon = order === 'asc' ? ChevronUp : ChevronDown;
  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>
      <Link
        href={sortHref(field, current, order, params)}
        className={cn(
          'inline-flex items-center gap-0.5 whitespace-nowrap',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
        {active ? (
          <Icon className="size-3 text-primary" />
        ) : (
          <ChevronDown className="size-3 opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </Link>
    </TableHead>
  );
}
