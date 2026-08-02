import { CircuitMark } from '@/components/brand/circuit-mark';
import Link from 'next/link';

/**
 * Branded 404. The default Next.js not-found is a bare black page with no shell
 * or way back - a dead end. This keeps the wordmark, explains the miss, and
 * offers the obvious exits (dashboard + directory).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Link href="/" className="flex items-center gap-2" title="tor.sockets">
        <CircuitMark className="shrink-0" />
        <span className="font-mono text-sm font-semibold tracking-tight">
          tor<span className="text-muted-foreground">.sockets</span>
        </span>
      </Link>

      <div className="space-y-2">
        <p className="font-mono text-5xl font-semibold tabular-nums text-primary">404</p>
        <h1 className="text-lg font-medium">This page could not be found.</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The relay, family, or page you were looking for is not here - it may have rotated out of
          the consensus, or the link is wrong.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to dashboard
        </Link>
        <Link
          href="/relays"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
        >
          Browse relays
        </Link>
      </div>
    </main>
  );
}
