import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * StatTile - the single KPI tile primitive.
 *
 * Two render shapes, both reproduced verbatim from the originals so there is
 * zero visual change:
 *
 *  - Rich dashboard tile (when `icon` is given): a `Card` with a top accent
 *    line, a square icon chip, an optional `aside` (e.g. UptimeRing), a
 *    condensed uppercase label, a large mono tabular value, and a hint.
 *  - Bare headline tile (no `icon`/`accent`): a flat bordered box with
 *    label / value / hint, the shape used by the versions & health pages,
 *    where `tone` carries severity colour onto the value.
 *
 * The `accent` key maps to the role/severity palette composites (chip border +
 * line fill); it only matters for the rich variant.
 */
export type StatTileAccent = 'success' | 'primary' | 'exit' | 'authority';

const ACCENTS: Record<StatTileAccent, { chip: string; line: string }> = {
  success: { chip: 'border-success/25 bg-success/12 text-success', line: 'bg-success' },
  primary: { chip: 'border-primary/25 bg-primary/12 text-primary', line: 'bg-primary' },
  exit: { chip: 'border-role-exit/25 bg-role-exit/12 text-role-exit', line: 'bg-role-exit' },
  authority: {
    chip: 'border-role-authority/25 bg-role-authority/12 text-role-authority',
    line: 'bg-role-authority',
  },
};

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  aside,
  accent,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
  aside?: ReactNode;
  accent?: StatTileAccent;
}) {
  // Rich dashboard tile: icon ⇒ Card + accent line + chip.
  if (Icon) {
    const a = accent ? ACCENTS[accent] : undefined;
    return (
      <Card className="gap-0 overflow-hidden py-0">
        {a ? <div className={cn('h-0.5 w-full', a.line)} /> : null}
        <CardContent className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            {a ? (
              <span
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md border',
                  a.chip,
                )}
              >
                <Icon className="size-4" />
              </span>
            ) : (
              <Icon className="size-4" />
            )}
            {aside}
          </div>
          <div>
            <p className="font-condensed text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              {label}
            </p>
            <p className="mt-1.5 font-mono text-[28px] leading-none font-semibold tracking-tight tabular-nums">
              {value}
            </p>
          </div>
          {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
        </CardContent>
      </Card>
    );
  }

  // Bare headline tile (versions / health): tone colours the value.
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="font-condensed text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn('mt-1 font-mono text-3xl font-semibold tabular-nums', tone)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
