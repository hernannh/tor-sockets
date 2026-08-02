import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * PageHeader - the single page-title primitive.
 *
 * Every app page had its own hand-rolled title block, which is why eleven of
 * them had drifted apart. The title uses `font-display` so the app carries the
 * same typographic voice as the landing instead of the framework default.
 *
 * `aside` is the right-hand slot (counters, export links, window pickers);
 * `align` controls how it sits against the title block - 'end' for one-line
 * asides, 'start' when the aside is a stack of controls.
 */
export function PageHeader({
  title,
  description,
  aside,
  align = 'end',
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  align?: 'start' | 'end';
  back?: { href: string; label: string };
}) {
  return (
    <div className="space-y-2">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {back.label}
        </Link>
      ) : null}
      <div
        className={cn(
          'flex flex-wrap justify-between gap-3',
          align === 'start' ? 'items-start' : 'items-end',
        )}
      >
        <div className="min-w-0 space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-pretty text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {aside}
      </div>
    </div>
  );
}

/**
 * SectionHeading - the h2 inside a page. Condensed uppercase, matching the
 * label style of StatTile so section markers and tile labels read as one scale.
 */
export function SectionHeading({
  children,
  aside,
  className,
}: {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-2', className)}>
      <h2 className="font-condensed text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {children}
      </h2>
      {aside}
    </div>
  );
}
