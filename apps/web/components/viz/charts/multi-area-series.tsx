'use client';

import { timeAxis } from '@/lib/chart-time';
import { formatBandwidth, formatBandwidthAxis, formatCompact, formatNumber } from '@/lib/format';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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

/**
 * Multi-series area chart over time (e.g. relays running vs stopped, stacked).
 * `points` carry a `time` plus one numeric field per series; `series` declares
 * which keys to draw, their stroke, and legend name. Tooltip/legend are themed
 * via CSS tokens so they read on the dark surface.
 */
/** Must match the wrapper's `h-44` (11rem). See the note in trend-chart.tsx:
    a percentage height makes recharts measure the parent on mount, and a 0 there
    renders a zero-size SVG it never retries. */
const CHART_HEIGHT = 176;

export function MultiAreaSeries({
  points,
  series,
  ariaLabel,
  format,
  stack,
  fillOpacity,
}: {
  points: Record<string, number | string>[];
  series: { key: string; stroke: string; name: string }[];
  ariaLabel: string;
  format?: FormatKind;
  stack?: boolean;
  fillOpacity?: number;
}) {
  const fmt = format ? FORMATTERS[format] : undefined;
  const axisFmt = format ? AXIS_FORMATTERS[format] : undefined;
  const data = points;
  const { ticks, tickFormatter } = useMemo(
    () => timeAxis(points.map((p) => String(p.time ?? ''))),
    [points],
  );

  if (points.length === 0) return null;

  return (
    <div className="h-44 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--foreground)',
              fontSize: 12,
            }}
            itemStyle={{ color: 'var(--foreground)' }}
            labelStyle={{ color: 'var(--muted-foreground)' }}
            formatter={(v) => (fmt ? fmt(Number(v)) : String(v))}
            labelFormatter={(t) =>
              t ? new Date(String(t)).toISOString().slice(0, 16).replace('T', ' ') : ''
            }
            cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }}
            iconType="circle"
          />
          {series.map((s) => (
            <Area
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={s.stroke}
              strokeWidth={2}
              fill={s.stroke}
              fillOpacity={fillOpacity ?? (stack ? 0.35 : 0.12)}
              stackId={stack ? 'a' : undefined}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
