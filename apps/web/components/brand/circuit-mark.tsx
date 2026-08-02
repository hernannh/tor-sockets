import { cn } from '@/lib/utils';

/**
 * The Tor-Sockets mark: the 3-hop circuit (guard → middle → exit). Consumes the
 * role tokens so it tracks the palette automatically. Used in headers/footers;
 * the favicon/OG routes use hex literals (app/icon.svg) since they render
 * outside the CSS context.
 */
export function CircuitMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 16" className={cn('h-4 w-7', className)} aria-hidden="true">
      <line x1="5" y1="8" x2="23" y2="8" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="5" cy="8" r="3" fill="var(--role-guard)" />
      <circle cx="14" cy="8" r="3" fill="var(--role-middle)" />
      <circle cx="23" cy="8" r="3" fill="var(--role-exit)" />
    </svg>
  );
}
