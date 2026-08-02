import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * BarRow - the unified horizontal-bar primitive.
 *
 * Three variants, each reproducing the exact markup of the originals so there
 * is zero visual change:
 *
 *  - `default` - a grid row `[label | track | right]` with a single fill, the
 *    shape used by the health `BarList` and the versions "by status" list.
 *    When neither `label` nor `right` is given it degrades to the bare track
 *    (e.g. the versions top-versions table cell).
 *  - `dual` - a grid row whose track carries a guard fill plus an exit tick
 *    (concentration panel). Likewise bare when label/right are absent (families
 *    table cell).
 *  - `cell` - the compact fixed-width pill + value used in dense tables
 *    (relay guard/exit probability).
 *
 * `bar` and `exitTick` are fractions in 0..1 (clamped). `tone` is the fill
 * className for default/dual (e.g. `bg-sev-high/60`, `bg-role-guard/70`) so the
 * exact colour + opacity is preserved; for `cell` it is the role key
 * `guard` | `exit`.
 *
 * The grid template is applied via an inline style (not a Tailwind class) so
 * the per-call column widths (`3rem 1fr 5rem`, `9rem 1fr 5rem`, …) work without
 * requiring Tailwind to see every literal - the rendered CSS is identical to
 * the original `grid-cols-[…]`.
 */
export type BarRowVariant = 'default' | 'dual' | 'cell';

export interface BarRowProps {
  /** First-column label. A string is wrapped in the standard mono label span;
   * a ReactNode is rendered verbatim (e.g. a rich label block). */
  label?: ReactNode;
  /** Secondary line under a string label (ignored for ReactNode labels). */
  sub?: ReactNode;
  /** Fill fraction, 0..1 (clamped). */
  bar: number;
  /** Fill className (default/dual) or role key `guard`|`exit` (cell). */
  tone?: string;
  /** Right-column value. A string is wrapped in the standard mono value span;
   * a ReactNode is rendered verbatim. */
  right?: ReactNode;
  /** cell variant: the numeric value shown beside the pill. */
  value?: ReactNode;
  variant?: BarRowVariant;
  /** dual only: exit-tick fraction, 0..1 (clamped). */
  exitTick?: number;
  /** default/dual grid template columns, e.g. `3rem 1fr 5rem`. */
  gridCols?: string;
  /** Extra classes appended to the label span (tone colour, `uppercase`, …). */
  labelClassName?: string;
  /** Extra classes on the track (height/radius overrides, e.g. `h-4`). */
  trackClassName?: string;
  /** Extra classes on the fill (e.g. `rounded-sm`). */
  fillClassName?: string;
  /** Optional `title` tooltips (preserves the concentration hover detail). */
  fillTitle?: string;
  exitTickTitle?: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function LabelCell({
  label,
  sub,
  labelClassName,
}: {
  label: ReactNode;
  sub?: ReactNode;
  labelClassName?: string;
}) {
  if (typeof label !== 'string') return <>{label}</>;
  if (sub) {
    return (
      <div className="min-w-0">
        <span className={cn('font-mono text-sm font-medium', labelClassName)}>{label}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </div>
    );
  }
  return <span className={cn('font-mono text-sm font-medium', labelClassName)}>{label}</span>;
}

function RightCell({ right }: { right: ReactNode }) {
  if (typeof right !== 'string') return <>{right}</>;
  return <span className="text-right font-mono text-sm tabular-nums">{right}</span>;
}

export function BarRow({
  label,
  sub,
  bar,
  tone = 'bg-primary',
  right,
  value,
  variant = 'default',
  exitTick,
  gridCols = '3rem 1fr 5rem',
  labelClassName,
  trackClassName,
  fillClassName,
  fillTitle,
  exitTickTitle,
}: BarRowProps) {
  const w = `${clamp01(bar) * 100}%`;

  if (variant === 'cell') {
    const isGuard = tone !== 'exit';
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className={cn('block h-full rounded-full', isGuard ? 'bg-role-guard' : 'bg-role-exit')}
            style={{ width: w }}
          />
        </span>
        {value ? (
          <span
            className={cn(
              'w-11 text-right font-mono text-xs tabular-nums',
              isGuard ? 'text-role-guard/80' : 'text-role-exit/80',
            )}
          >
            {value}
          </span>
        ) : null}
      </div>
    );
  }

  const dual = variant === 'dual';
  const trackBase = dual
    ? 'relative h-6 overflow-hidden rounded-md border border-border bg-muted/30'
    : 'relative h-5 overflow-hidden rounded border border-border bg-muted/30';

  const track = (
    <div className={cn(trackBase, trackClassName)}>
      <div
        className={cn('absolute inset-y-0 left-0', tone, fillClassName)}
        style={{ width: w }}
        title={fillTitle}
      />
      {dual ? (
        <div
          className="absolute top-0 h-1.5 w-0.5 bg-role-exit"
          style={{ left: `calc(${clamp01(exitTick ?? 0) * 100}% - 1px)` }}
          title={exitTickTitle}
        />
      ) : null}
    </div>
  );

  // Bare track (no surrounding grid row): the in-table-cell usages.
  if (label == null && right == null) {
    return track;
  }

  return (
    <div className="grid items-center gap-3" style={{ gridTemplateColumns: gridCols }}>
      <LabelCell label={label as ReactNode} sub={sub} labelClassName={labelClassName} />
      {track}
      <RightCell right={right as ReactNode} />
    </div>
  );
}
