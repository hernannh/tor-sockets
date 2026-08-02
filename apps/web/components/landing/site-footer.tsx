import { CircuitMark } from '@/components/brand/circuit-mark';
import { REPO_URL } from '@/lib/site';
import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <CircuitMark />
            <span className="font-mono text-sm font-semibold tracking-tight">
              tor<span className="text-muted-foreground">.sockets</span>
            </span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Federated Tor network health &amp; concentration monitor.
          </p>
        </div>
        <div>
          <p className="font-condensed text-xs tracking-wider text-muted-foreground uppercase">
            Product
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="/dashboard"
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="/map"
              >
                Map
              </Link>
            </li>
            <li>
              <Link
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="/relays"
              >
                Relays
              </Link>
            </li>
            <li>
              <Link
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="/api/docs"
              >
                API
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-condensed text-xs tracking-wider text-muted-foreground uppercase">
            Project
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {REPO_URL ? (
              <li>
                <a
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source
                </a>
              </li>
            ) : null}
            <li>
              <Link
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="/.well-known/tor-federation.json"
              >
                Federation actor
              </Link>
            </li>
            <li>
              <Link
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="/operator"
              >
                Operator console
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 text-center text-xs text-balance text-muted-foreground">
          Data sourced from{' '}
          <a
            className="transition-colors hover:text-foreground hover:underline"
            href="https://metrics.torproject.org/onionoo.html"
          >
            The Tor Project
          </a>{' '}
          under CC0 via Onionoo and CollecTor. &ldquo;Tor&rdquo; and the Onion logo are trademarks
          of The Tor Project, Inc.
        </div>
      </div>
    </footer>
  );
}
