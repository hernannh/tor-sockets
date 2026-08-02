'use client';

import { timeAxis } from '@/lib/chart-time';
import { formatBandwidth, formatBandwidthAxis, formatCompact, formatNumber } from '@/lib/format';
import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type FormatKind = 'number' | 'compact' | 'bandwidth';

const FORMATTERS: Record<FormatKind, (n: number) => string> = {
  number: formatNumber,
  compact: formatCompact,
  bandwidth: formatBandwidth,
};
const AXIS_FORMATTERS: Record<FormatKind, (n: number) => string> = {
  number: formatNumber,
  compact: formatCompact,
  bandwidth: formatBandwidthAxis,
};

type SeriesTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { value?: number; time?: string } }>;
  formatValue?: (n: number) => string;
};

/**
 * Generic single-series area chart over time. Used by /network-history for the
 * relay-count / consensus-weight / advertised-bandwidth series. `stroke` takes a
 * CSS variable; `format` is a string kind (resolved to a formatter inside the
 * client, since functions can't cross the server→client boundary).
 */
/** Must match the wrapper's `h-44` (11rem). See the note in trend-chart.tsx:
    a percentage height makes recharts measure the parent on mount, and a 0 there
    renders a zero-size SVG it never retries. */
const CHART_HEIGHT = 176;

export function AreaSeries({
  points,
  stroke = 'var(--primary)',
  ariaLabel,
  format,
}: {
  points: { time: string; value: number }[];
  stroke?: string;
  ariaLabel: string;
  format?: FormatKind;
}) {
  const reactId = useId();
  const gradId = `area-${reactId.replace(/:/g, '')}`;
  const fmt = format ? FORMATTERS[format] : undefined;
  const axisFmt = format ? AXIS_FORMATTERS[format] : undefined;
  const data = useMemo(() => points.map((p) => ({ time: p.time, value: p.value })), [points]);
  const { ticks, tickFormatter } = useMemo(() => timeAxis(points.map((p) => p.time)), [points]);

  if (points.length === 0) return null;

  return (
    <div className="h-44 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            ticks={ticks}
            tickFormatter={tickFormatter}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v) => (axisFmt ? axisFmt(Number(v)) : String(v))}
          />
          <Tooltip
            content={<SeriesTooltip formatValue={fmt} />}
            cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
          />
          <Area
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SeriesTooltip({ active, payload, formatValue }: SeriesTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const value = point?.value;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      <p className="font-mono text-sm font-semibold tabular-nums">
        {value != null && formatValue ? formatValue(Number(value)) : (value ?? '-')}
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        {point?.time ? new Date(point.time).toISOString().slice(0, 16).replace('T', ' ') : ''}
      </p>
    </div>
  );
}
