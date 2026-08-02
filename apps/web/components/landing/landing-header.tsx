import { CircuitMark } from '@/components/brand/circuit-mark';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/** Minimal landing chrome: the mark, two links, one CTA. No app nav. */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <CircuitMark />
          <span className="font-mono text-sm font-semibold tracking-tight">
            tor<span className="text-muted-foreground">.sockets</span>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/api/docs"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            API
          </Link>
          <Button asChild size="sm" className="ml-2">
            <Link href="/operator">Operator</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
