'use client';

import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

const MINUTE_MS = 60 * 1000;

/**
 * How long the pipeline may go without completing a cycle before the readout
 * calls it stalled. The poll runs hourly, so two intervals allows one missed
 * tick (a retry, a restart) without crying wolf, while still surfacing a real
 * stall within a couple of hours instead of never.
 */
const POLL_STALE_AFTER_MS = 2 * 60 * MINUTE_MS;

/**
 * Live readout of data freshness AND pipeline liveness. They are two different
 * questions and this used to conflate them, which hid a real outage.
 *
 * The trap: our newest consensus is structurally 1-2h old even when everything
 * works, because Onionoo republishes about an hour behind the consensus it
 * serves. The old version showed only consensus age plus a countdown to
 * `last + 1h` - a deadline that Onionoo's lag guarantees is already past, so it
 * read "next due" permanently. When the Onionoo poll started timing out and the
 * data froze two consensuses behind, the chip looked exactly as it always had.
 *
 * So the dot now tracks the LAST SUCCESSFUL POLL, which is the thing that is
 * supposed to happen hourly and whose absence is unambiguous. Consensus age
 * stays visible as the data-age number it always was, without a countdown
 * pretending to predict Onionoo.
 *
 * The page HTML is ISR-cached for up to a minute, so a relative age rendered on
 * the server is stale the moment it is served and would mismatch on hydration.
 * The first paint reuses the strings the server already computed; only after
 * mount does the component take over and tick.
 */
export function ConsensusClock({
  last,
  initialAge,
  lastPoll,
  initialPollAge,
  peers,
}: {
  last: string | null;
  initialAge: string;
  lastPoll: string | null;
  initialPollAge: string;
  peers: number;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const age = now === null || last === null ? initialAge : formatRelative(last);
  const pollAge = now === null || lastPoll === null ? initialPollAge : formatRelative(lastPoll);

  // Never polled at all reads as stalled, not as healthy: a fresh instance that
  // has not managed a single cycle is exactly the case worth showing in red.
  const pollMs = lastPoll ? new Date(lastPoll).getTime() : null;
  const healthy = pollMs !== null && (now ?? Date.now()) - pollMs < POLL_STALE_AFTER_MS;

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-xs text-muted-foreground">
      <span
        className={cn('size-1.5 rounded-full', healthy ? 'bg-status-running' : 'bg-status-stopped')}
        title={
          healthy
            ? `ingestion healthy - last cycle ${pollAge}`
            : lastPoll
              ? `ingestion stalled - last successful cycle ${pollAge}`
              : 'ingestion has never completed a cycle'
        }
      />
      consensus {last ? age : '-'}
      <span className="text-muted-foreground/60">· polled {lastPoll ? pollAge : 'never'}</span>
      <span className="hidden sm:inline">· {peers} peers</span>
    </span>
  );
}
