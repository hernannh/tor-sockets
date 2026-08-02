import { formatHhi } from '@/lib/format';
import { cn } from '@/lib/utils';
import { HHI_BANDS, describeHhi } from '@tor-sockets/api-contract';

/**
 * Concentration Gauge - the dashboard signature element.
 *
 * Plots an HHI value on its full 0-10000 range with the band boundaries marked,
 * so the operator can read at a glance whether the network's role-weight is
 * dangerously concentrated. The marks are at 1000 and 2000 - the points where
 * the distribution is equivalent to 10 and to 5 equal operators (HHI = 10000/N,
 * see `hhi-bands.ts`). The scale is sqrt so those marks land mid-track and the
 * monopoly zone (→10k) still breathes; numeric labels always show the true
 * value.
 *
 * Server component (pure SVG, no client JS). Colour carries meaning but is never
 * the only encoding - position, the numeric readout above, and the accessible
 * meter role all convey the same value.
 */

const SCALE_MAX = 10_000;
const THRESHOLDS = [HHI_BANDS.moderate, HHI_BANDS.high] as const;

const VB_W = 640;
const VB_H = 80;
const PAD = 16;
const TRACK_W = VB_W - PAD * 2; // 608
const TRACK_Y = 34;
const TRACK_H = 12;

const pos = (v: number) => Math.sqrt(Math.min(Math.max(v, 0), SCALE_MAX) / SCALE_MAX);
const xFor = (v: number) => PAD + pos(v) * TRACK_W;

const MARKER_COLOR: Record<string, string> = {
  low: 'var(--sev-low)',
  moderate: 'var(--sev-medium)',
  high: 'var(--sev-critical)',
};

const ZONES = [
  { from: 0, to: HHI_BANDS.moderate, fill: 'var(--sev-low)' },
  { from: HHI_BANDS.moderate, to: HHI_BANDS.high, fill: 'var(--sev-medium)' },
  { from: HHI_BANDS.high, to: SCALE_MAX, fill: 'var(--sev-critical)' },
] as const;

export function ConcentrationGauge({
  hhi,
  severity,
  className,
}: {
  hhi: number;
  severity: 'low' | 'moderate' | 'high';
  className?: string;
}) {
  const markerX = xFor(hhi);
  const markerColor = MARKER_COLOR[severity];

  return (
    <div className={cn('w-full', className)}>
      <div
        role="meter"
        aria-valuenow={Math.round(hhi)}
        aria-valuemin={0}
        aria-valuemax={SCALE_MAX}
        aria-label={`HHI concentration ${formatHhi(hhi)}, ${describeHhi(hhi)}: under 1000 is 10 or more equivalent operators, 1000 to 2000 is five to ten, over 2000 is fewer than five`}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="h-auto w-full"
          aria-hidden="true"
          focusable="false"
        >
          {/* zone track */}
          {ZONES.map((z) => {
            const x = xFor(z.from);
            const w = xFor(z.to) - x;
            return (
              <rect
                key={z.to}
                x={x}
                y={TRACK_Y}
                width={w}
                height={TRACK_H}
                rx={3}
                fill={z.fill}
                fillOpacity={0.16}
              />
            );
          })}

          {/* threshold ticks + labels */}
          {THRESHOLDS.map((t) => {
            const x = xFor(t);
            return (
              <g key={t}>
                <line
                  x1={x}
                  y1={TRACK_Y - 4}
                  x2={x}
                  y2={TRACK_Y + TRACK_H + 4}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={TRACK_Y + TRACK_H + 20}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ font: '500 13px var(--font-condensed)' }}
                >
                  {t.toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* end caps */}
          <text
            x={PAD}
            y={TRACK_Y + TRACK_H + 20}
            textAnchor="start"
            className="fill-muted-foreground/60"
            style={{ font: '500 13px var(--font-condensed)' }}
          >
            0
          </text>
          <text
            x={VB_W - PAD}
            y={TRACK_Y + TRACK_H + 20}
            textAnchor="end"
            className="fill-muted-foreground/60"
            style={{ font: '500 13px var(--font-condensed)' }}
          >
            10k
          </text>

          {/* current-value marker */}
          <g>
            <line
              x1={markerX}
              y1={TRACK_Y - 8}
              x2={markerX}
              y2={TRACK_Y + TRACK_H + 8}
              stroke={markerColor}
              strokeWidth={2}
            />
            <path
              d={`M ${markerX - 5} ${TRACK_Y - 10} L ${markerX + 5} ${TRACK_Y - 10} L ${markerX} ${TRACK_Y - 3} Z`}
              fill={markerColor}
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
