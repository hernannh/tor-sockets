import { ConsensusClock } from '@/components/consensus-clock';
import { getLastIngestSuccess, getPeers, getStats } from '@/lib/api/queries';
import { formatRelative } from '@/lib/format';
import { getDb } from '@tor-sockets/db';

/**
 * Live network readout for the header: age of the last processed consensus, how
 * long ago the ingestion worker last completed a cycle, and the federation peer
 * count. Server-rendered, revalidated on the consensus cadence, then handed to a
 * client clock that keeps ticking between revalidations. Degrades to nothing if
 * the database is unreachable (e.g. build time) so it can never take the layout
 * down.
 *
 * The poll timestamp is read separately from the consensus because they answer
 * different questions - see the note in `consensus-clock.tsx`.
 */
export const revalidate = 60;

/** Must match the repeatable job name the worker heartbeats under. */
const POLL_JOB = 'onionoo-poll';

export async function ConsensusStatus() {
  let lastConsensus: string | null = null;
  let lastPoll: string | null = null;
  let peerCount = 0;

  try {
    const db = getDb(process.env.DATABASE_URL);
    const [stats, peers, poll] = await Promise.all([
      getStats(db),
      getPeers(db),
      getLastIngestSuccess(db, POLL_JOB),
    ]);
    lastConsensus = stats.last_consensus;
    peerCount = peers.length;
    lastPoll = poll;
  } catch {
    return null;
  }

  return (
    <ConsensusClock
      last={lastConsensus}
      initialAge={formatRelative(lastConsensus)}
      lastPoll={lastPoll}
      initialPollAge={formatRelative(lastPoll)}
      peers={peerCount}
    />
  );
}
