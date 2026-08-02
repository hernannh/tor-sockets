'use client';

import { timeAxis } from '@/lib/chart-time';
import { formatCompact } from '@/lib/format';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Recharts-backed HHI trend. Replaces the inline sparkline on /trends with real
 * axes, a crosshair, and a hover tooltip - the sparkline was fine for a glance,
 * but a labelled chart lets you read the actual values and the slope.
 *
 * `stroke` takes a CSS variable so the line tracks the palette token for the
 * series direction (rising/falling/flat). Runs only on the client (recharts
 * needs the DOM); the page passes already-fetched points as props.
 */
/** Must match the wrapper's `h-40` (10rem). */
const CHART_HEIGHT = 160;

export function TrendChart({
  points,
  stroke = 'var(--primary)',
  ariaLabel = 'HHI trend',
}: {
  points: { time: string; hhi: number }[];
  stroke?: string;
  ariaLabel?: string;
}) {
  const data = useMemo(
    () =>
      points.map((p) => ({
        time: p.time,
        hhi: Math.round(p.hhi),
      })),
    [points],
  );
  const { ticks, tickFormatter } = useMemo(() => timeAxis(points.map((p) => p.time)), [points]);
  // Simple primitive string: no useMemo needed - the hook overhead exceeds the
  // template literal. (vercel-react-best-practices: rerender-simple-expression-in-memo)
  const gradId = `hhi-grad-${Math.round(points[0]?.hhi ?? 0)}`;

  if (points.length === 0) return null;

  return (
    <div className="h-40 w-full" role="img" aria-label={ariaLabel}>
      {/* Height is a NUMBER, not "100%". With a percentage, recharts has to
          measure the parent on mount, and when that measurement comes back 0 -
          which it does here, reproducibly, on /trends - it renders an SVG of
          zero size and never retries. The card kept its 160px of reserved space
          and stayed blank, looking like "no data" on a page that had six points
          to draw. Dispatching a window resize made all four charts appear at
          once, which is what pinned the cause. Only the width needs measuring. */}
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
            width={44}
            domain={[0, 'auto']}
            tickFormatter={(v) => formatCompact(Number(v))}
          />
          <Tooltip content={<HhiTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
          <Area
            dataKey="hhi"
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

type HhiTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { hhi?: number; time?: string } }>;
};

function HhiTooltip({ active, payload }: HhiTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const hhi = point?.hhi;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      <p className="font-mono text-sm font-semibold tabular-nums">
        {hhi != null ? Math.round(hhi) : '-'}
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        {point?.time ? new Date(point.time).toISOString().slice(0, 16).replace('T', ' ') : ''}
      </p>
    </div>
  );
}
