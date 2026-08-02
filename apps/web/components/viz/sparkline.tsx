import { cn } from '@/lib/utils';

/**
 * Minimal inline SVG sparkline - server component, no client JS.
 * Scales to the value range and stretches to the container width
 * (preserveAspectRatio="none"). Colour is carried by a `text-*` tone token
 * via `currentColor`, matching the rest of the severity palette.
 */
const W = 320;
const H = 48;

export function Sparkline({
  points,
  tone,
  ariaLabel,
  area = false,
}: {
  points: number[];
  tone?: string;
  ariaLabel: string;
  area?: boolean;
}) {
  if (points.length === 0) return <div className="h-12" />;
  if (points.length === 1) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-12 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${ariaLabel} (single point)`}
      >
        <title>{ariaLabel}</title>
        <line
          x1={0}
          y1={H / 2}
          x2={W}
          y2={H / 2}
          className={cn('stroke-current', tone)}
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = W / (points.length - 1);
  const coords = points.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / span) * (H - 4) - 2;
    return [x, y] as const;
  });
  const path = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const strokeClass = cn('stroke-current', tone);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-12 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>
      {area ? (
        <path
          d={`${path} L${(coords.length - 1) * step},${H} L0,${H} Z`}
          className={cn('fill-current opacity-10', tone)}
          stroke="none"
        />
      ) : null}
      <path d={path} fill="none" className={strokeClass} strokeWidth={1.5} />
    </svg>
  );
}
