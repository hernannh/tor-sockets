import { cn } from '@/lib/utils';

/**
 * UptimeRing - the "live signal" accent on the dashboard hero card
 * (Relays running). Pure SVG, server component; colour comes from a text token
 * via `currentColor` so it reuses the status/severity palette instead of a
 * hardcoded hex.
 */
const SIZE = 40;
const STROKE = 4;
const R = (SIZE - STROKE) / 2; // 18
const C = 2 * Math.PI * R;

export function UptimeRing({
  pct,
  colorClass = 'text-success',
  label,
}: {
  pct: number;
  colorClass?: string;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = C * (1 - clamped / 100);
  const center = SIZE / 2;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
      className={cn('shrink-0', colorClass)}
    >
      <circle
        cx={center}
        cy={center}
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        className="opacity-[0.15]"
      />
      <circle
        cx={center}
        cy={center}
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
