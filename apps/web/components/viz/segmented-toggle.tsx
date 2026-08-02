import { cn } from '@/lib/utils';
import Link from 'next/link';

/**
 * SegmentedToggle - a compact pill-style switcher.
 *
 * Two exports share the exact same visual markup (wrapper + active/inactive
 * item styling), extracted into the `toggleItemClass` helper below so the two
 * never drift:
 *
 *  - `SegmentedToggle` - client, `<button>` based, drives local state
 *    (replaces the concentration-panel RoleToggle).
 *  - `SegmentedToggleLink` - `<Link>` based, drives navigation via searchParams
 *    (replaces the trends/correlation server toggles). It carries no hooks and
 *    no handlers, so it renders identically on the server; it lives in this
 *    `'use client'` module only to share the markup helper verbatim, as the
 *    design-system barrel expects both from one file. (Next.js App Router
 *    cannot host a client and a server export in the same module, so this is
 *    the single-module compromise.)
 */

const WRAPPER_CLASS =
  'inline-flex shrink-0 items-center rounded-lg border border-border p-0.5 text-xs';

function toggleItemClass(active: boolean) {
  return cn(
    'rounded-md px-2.5 py-1 font-medium transition-colors',
    active
      ? 'bg-secondary text-secondary-foreground'
      : 'text-muted-foreground hover:text-foreground',
  );
}

export function SegmentedToggle({
  value,
  onValueChange,
  options,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className={WRAPPER_CLASS}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onValueChange(o.value)}
          className={toggleItemClass(value === o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SegmentedToggleLink({
  options,
}: {
  options: { value: string; label: string; href: string; active: boolean }[];
}) {
  return (
    <div className={WRAPPER_CLASS}>
      {options.map((o) => (
        <Link key={o.value} href={o.href} className={toggleItemClass(o.active)}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
