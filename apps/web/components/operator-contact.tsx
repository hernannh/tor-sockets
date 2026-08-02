import { cn } from '@/lib/utils';
import { parseContactInfo } from '@tor-sockets/api-contract';
import { BadgeCheck } from 'lucide-react';

/**
 * Renders a Tor ContactInfo string as a clean operator identity instead of the
 * raw machine blob (`email:mail[]x.org url:... proof:uri-rsa ciissversion:2`).
 * Shows the domain as the headline, a secondary name/email line, an optional
 * domain-verified badge, and keeps the full raw string in the tooltip. Pure
 * render (no state), so it works in both server and client components.
 */
export function OperatorContact({
  contact,
  className,
  showBadge = false,
}: {
  contact: string | null | undefined;
  className?: string;
  /** Prepend a domain-verified ✓ when the contact carries a `proof:uri/dns-rsa`. */
  showBadge?: boolean;
}) {
  const p = parseContactInfo(contact);
  if (!p.raw) return <span className="text-muted-foreground">-</span>;

  const primary = p.domain ?? p.name ?? p.email ?? p.raw;
  const lower = primary.toLowerCase();
  const secondary =
    p.name && p.name.toLowerCase() !== lower
      ? p.name
      : p.email && p.email.toLowerCase() !== lower
        ? p.email
        : undefined;

  return (
    <span className={cn('flex min-w-0 items-start gap-1.5', className)} title={p.raw}>
      {showBadge && p.verified && (
        <BadgeCheck
          className="mt-0.5 size-3.5 shrink-0 text-sev-low"
          aria-label="domain-verified"
        />
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium">{primary}</span>
        {secondary && (
          <span className="truncate font-mono text-xs text-muted-foreground">{secondary}</span>
        )}
      </span>
    </span>
  );
}
