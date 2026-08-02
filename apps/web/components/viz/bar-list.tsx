import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarRow } from '@/components/viz/bar-row';
import type { ReactNode } from 'react';

/**
 * BarList - a titled Card of horizontal bars (the health-page shape).
 * Each row is a `BarRow` (default variant) on the canonical
 * `3rem 1fr 5rem` grid: uppercase mono label · track · right value.
 */
export interface BarListItem {
  key: string;
  label: ReactNode;
  /** Fill fraction, 0..1. */
  bar: number;
  /** Fill className, e.g. `bg-sev-high/60`. */
  tone?: string;
  right?: ReactNode;
}

export function BarList({
  title,
  rows,
}: {
  title: string;
  rows: BarListItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <BarRow
            key={r.key}
            label={r.label}
            bar={r.bar}
            tone={r.tone}
            right={r.right}
            variant="default"
            labelClassName="uppercase"
          />
        ))}
      </CardContent>
    </Card>
  );
}
