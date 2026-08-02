import { getDb, ingestStatus } from '@tor-sockets/db';
import { type ConnectionOptions, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { getInstanceIdentity } from './instance';
import { runAlertEvaluation } from './jobs/alert-evaluate';
import { runAnomalyDetection } from './jobs/anomaly-detect';
import { runConcentrationSnapshot } from './jobs/concentration-snapshot';
import { runConsensusCrossCheck } from './jobs/consensus-crosscheck';
import { OPS, logFederationEvent } from './jobs/federation-log';
import { pollOnionoo } from './jobs/onionoo-poll';
import { runPeerSync } from './jobs/peer-sync';
import { runPeeringdbSync } from './jobs/peeringdb-sync';
import { pruneOldRows } from './jobs/prune-old-rows';
import { ensureDefaultAlertRules } from './jobs/seed-alert-rules';
import { makeRedisKv } from './kv';
import { parseRedisUrl } from './kv';

const log = (msg: string) => console.log(`[ingestion] ${new Date().toISOString()} ${msg}`);

const POLL_JOB_NAME = 'onionoo-poll';
const CONCENTRATION_JOB_NAME = 'concentration-snapshot';
const ANOMALY_JOB_NAME = 'anomaly-detect';
const ALERT_JOB_NAME = 'alert-evaluate';
const PEER_SYNC_JOB_NAME = 'peer-sync';
const PEERINGDB_SYNC_JOB_NAME = 'peeringdb-sync';
const CONSENSUS_CHECK_JOB_NAME = 'consensus-crosscheck';
const PRUNE_JOB_NAME = 'prune-old-rows';
const QUEUE_NAME = 'tor-sockets-ingestion';
// Every 20 minutes, not hourly, even though Onionoo only publishes hourly.
//
// Onionoo republishes at roughly HH:10 (measured: at 20:10 it served the 19:00
// consensus, at ~21:10 the 20:00 one). Polling at HH:00 landed ten minutes
// BEFORE each publish, so every consensus was picked up a full hour late.
//
// The asymmetry decides it: missing the window costs an hour of staleness,
// while an extra poll costs ~900ms and zero transfer - the conditional GET gets
// a 304 and stops. Three cheap requests an hour beat one well-aimed guess about
// a schedule observed twice. Override with ONIONOO_POLL_CRON.
const POLL_CRON = process.env.ONIONOO_POLL_CRON ?? '*/20 * * * *';
const PEER_SYNC_CRON = process.env.PEER_SYNC_CRON ?? '*/15 * * * *'; // every 15 min
const PEERINGDB_SYNC_CRON = process.env.PEERINGDB_SYNC_CRON ?? '0 4 * * 1'; // Mondays 04:00
const CONSENSUS_CHECK_CRON = process.env.CONSENSUS_CHECK_CRON ?? '30 */6 * * *'; // every 6h, :30
const PRUNE_CRON = process.env.PRUNE_CRON ?? '17 4 * * *'; // daily 04:17, off-peak

/** Best-effort CDC log write - never fail the parent job because of logging. */
async function emit(op: string, payload: unknown) {
  try {
    const identity = await getInstanceIdentity();
    const entry = await logFederationEvent(
      getDb(process.env.DATABASE_URL),
      identity.keypair,
      op,
      payload,
    );
    log(`cdc logged: ${op} seq=${entry.seq}`);
    return entry;
  } catch (err) {
    log(`cdc log failed (${op}): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function main() {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection: ConnectionOptions = parseRedisUrl(redisUrl);

  // Dedicated client for the KV cache (Onionoo Last-Modified).
  const kvRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const kv = makeRedisKv(kvRedis);

  const db = getDb(process.env.DATABASE_URL);

  // Self-bootstrap default alert rules + system operator (idempotent).
  const seed = await ensureDefaultAlertRules(db);
  log(
    `alert rules seeded: created=${seed.rulesCreated} total=${seed.rulesTotal} ` +
      `(operator=${seed.operatorId.slice(0, 8)})`,
  );

  // Retry transient failures (5xx, DB blips, network glitches) with the capped
  // exponential backoff defined on the worker, and cap Redis growth by pruning
  // completed/failed jobs. Without `attempts` the existing backoffStrategy is
  // dead code - BullMQ defaults to a single attempt.
  const defaultJobOptions = {
    attempts: 5,
    backoff: { type: 'custom' as const },
    removeOnComplete: { age: 86_400, count: 5_000 },
    removeOnFail: { age: 2_592_000 },
  };

  const queue = new Queue(QUEUE_NAME, { connection, defaultJobOptions });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const attempt = job.attemptsMade + 1;
      switch (job.name) {
        case POLL_JOB_NAME: {
          log(`job ${job.id} (${POLL_JOB_NAME}) started (attempt ${attempt})`);
          const result = await pollOnionoo(db, kv, {
            baseUrl: process.env.ONIONOO_BASE_URL,
          });
          if (result.status === 'fetched') {
            log(
              `poll ok: published=${result.relaysPublished} seen=${result.relaysSeen} ` +
                `running=${result.runningTrue}/${result.relaysSeen} ` +
                `cw=${result.consensusWeightSum} ${result.durationMs}ms`,
            );
            await emit(OPS.consensusProcessed, {
              published: result.relaysPublished,
              relays_seen: result.relaysSeen,
              relays_running: result.runningTrue,
              consensus_weight_sum: result.consensusWeightSum,
            });
            // Chain a concentration snapshot so the hypertable tracks each consensus.
            await queue.add(
              CONCENTRATION_JOB_NAME,
              {},
              { jobId: `concentration-${result.relaysPublished}` },
            );
          } else if (result.status === 'not_modified') {
            log(`poll 304 not-modified (${result.durationMs}ms)`);
          } else {
            log(`poll error: ${result.error}`);
            throw new Error(result.error);
          }
          // Heartbeat on BOTH successful outcomes. A 304 means the conditional
          // GET worked and Onionoo has nothing newer - that is a healthy cycle,
          // and between hourly updates it is the usual one. Recording only
          // `fetched` would make a live worker look stalled for most of the hour.
          await recordIngestSuccess(db, POLL_JOB_NAME, {
            outcome: result.status,
            duration_ms: result.durationMs,
            ...(result.status === 'fetched'
              ? { published: result.relaysPublished, relays_seen: result.relaysSeen }
              : {}),
          });
          return result;
        }
        case CONCENTRATION_JOB_NAME: {
          log(`job ${job.id} (${CONCENTRATION_JOB_NAME}) started`);
          const result = await runConcentrationSnapshot(db);
          if (result.status === 'ok') {
            const dims = Object.entries(result.perDimension)
              .map(([d, r]) => `${d}: ${r.keys} keys, hhi=${r.hhi.toFixed(0)}`)
              .join(' | ');
            log(`concentration ok: inserted=${result.inserted} ${result.durationMs}ms - ${dims}`);
            await emit(OPS.snapshotTaken, {
              at: result.at,
              inserted: result.inserted,
              dimensions: result.perDimension,
            });
            // Chain anomaly detection so findings track each snapshot.
            await queue.add(ANOMALY_JOB_NAME, {}, { jobId: `anomaly-${result.at}` });
          } else {
            log(`concentration empty (${result.durationMs}ms)`);
          }
          return result;
        }
        case ANOMALY_JOB_NAME: {
          log(`job ${job.id} (${ANOMALY_JOB_NAME}) started`);
          const identity = await getInstanceIdentity();
          const result = await runAnomalyDetection(db, {
            sourceInstance: identity.keypair.instanceId,
            sources: ['onionoo'],
          });
          const perType = Object.entries(result.perType)
            .map(([t, n]) => `${t}=${n}`)
            .join(' ');
          log(
            `anomalies: detected=${result.detected} inserted=${result.inserted} ${result.durationMs}ms${perType ? ` - ${perType}` : ''}`,
          );
          if (result.inserted > 0) {
            await emit(OPS.anomalyDetected, {
              detected: result.detected,
              inserted: result.inserted,
              per_type: result.perType,
            });
          }
          // Chain alert evaluation so rules fire on the latest anomalies/snapshot.
          await queue.add(ALERT_JOB_NAME, {}, { jobId: `alert-${Date.now()}` });
          return result;
        }
        case ALERT_JOB_NAME: {
          log(`job ${job.id} (${ALERT_JOB_NAME}) started`);
          const identity = await getInstanceIdentity();
          const result = await runAlertEvaluation(db, { instance: identity.keypair });
          log(
            `alerts: rules=${result.rulesEvaluated} fired=${result.fired} ` +
              `delivered=${result.delivered} ${result.durationMs}ms`,
          );
          if (result.fired > 0) {
            await emit(OPS.alertTriggered, {
              fired: result.fired,
              delivered: result.delivered,
            });
          }
          return result;
        }
        case PEER_SYNC_JOB_NAME: {
          log(`job ${job.id} (${PEER_SYNC_JOB_NAME}) started`);
          const identity = await getInstanceIdentity();
          const result = await runPeerSync(db, { instance: identity.keypair });
          log(
            `peer-sync: checked=${result.peersChecked} reached=${result.peersReached} divergences=${result.divergences} ${result.durationMs}ms${result.errors.length > 0 ? ` - errors: ${result.errors.length}` : ''}`,
          );
          if (result.peersReached > 0) {
            await emit(OPS.peerSynced, {
              checked: result.peersChecked,
              reached: result.peersReached,
              divergences: result.divergences,
            });
          }
          return result;
        }
        case PEERINGDB_SYNC_JOB_NAME: {
          log(`job ${job.id} (${PEERINGDB_SYNC_JOB_NAME}) started`);
          const result = await runPeeringdbSync(db);
          log(
            `peeringdb-sync: ${result.status} fetched=${result.fetched} upserted=${result.upserted} ${result.durationMs}ms`,
          );
          return result;
        }
        case CONSENSUS_CHECK_JOB_NAME: {
          log(`job ${job.id} (${CONSENSUS_CHECK_JOB_NAME}) started`);
          const identity = await getInstanceIdentity();
          const result = await runConsensusCrossCheck(db, {
            sourceInstance: identity.keypair.instanceId,
            sources: ['onionoo', 'consensus'],
          });
          log(
            `consensus-crosscheck: checked=${result.checked} confirmed=${result.confirmed} ` +
              `diverged=${result.diverged} (w=${result.weightDiverged} f=${result.flagDiverged} ` +
              `miss=${result.missingInConsensus} only=${result.onlyInConsensus}) ` +
              `anomalies=${result.anomaliesInserted} va=${result.validAfter} ${result.durationMs}ms`,
          );
          if (result.anomaliesInserted > 0) {
            await emit(OPS.anomalyDetected, {
              type: 'consensus_divergence',
              diverged: result.diverged,
              checked: result.checked,
            });
          }
          return result;
        }
        case PRUNE_JOB_NAME: {
          log(`job ${job.id} (${PRUNE_JOB_NAME}) started`);
          const result = await pruneOldRows(db);
          log(
            `prune: retention=${result.retentionDays}d anomalies=${result.anomaliesDeleted} ` +
              `alerts=${result.alertEventsDeleted} fedlog=${result.federationLogDeleted} ${result.durationMs}ms`,
          );
          return result;
        }
        default:
          log(`unknown job name: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: 1,
      settings: { backoffStrategy: (attempts) => Math.min(60_000 * 2 ** attempts, 30 * 60_000) },
    },
  );

  worker.on('failed', (job, err) => {
    log(`job ${job?.name}/${job?.id} failed: ${err.message}`);
  });

  await scheduleRepeatable(queue, POLL_JOB_NAME, POLL_CRON, 'onionoo-poll-hourly');
  await scheduleRepeatable(queue, PEER_SYNC_JOB_NAME, PEER_SYNC_CRON, 'peer-sync-recurring');
  await scheduleRepeatable(
    queue,
    PEERINGDB_SYNC_JOB_NAME,
    PEERINGDB_SYNC_CRON,
    'peeringdb-sync-weekly',
  );
  await scheduleRepeatable(
    queue,
    CONSENSUS_CHECK_JOB_NAME,
    CONSENSUS_CHECK_CRON,
    'consensus-crosscheck-recurring',
  );
  await scheduleRepeatable(queue, PRUNE_JOB_NAME, PRUNE_CRON, 'prune-old-rows-daily');

  // Kick off an immediate poll so a fresh deploy doesn't wait for the top of the hour.
  await queue.add(POLL_JOB_NAME, {}, { jobId: `onionoo-poll-bootstrap-${Date.now()}` });
  log('enqueued bootstrap poll');

  const shutdown = async (signal: string) => {
    log(`${signal} received, shutting down`);
    await worker.close();
    await queue.close();
    kvRedis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logAlertChannels();
  log('worker ready, waiting for jobs');
}

/**
 * State of the three delivery channels, printed once at boot.
 *
 * Every channel degrades to a silent no-op when its config is missing:
 * `deliverEmail` returns early without a transporter, `deliverTelegram` without
 * a bot token, and the rule simply records a failed delivery nobody reads. An
 * instance can therefore look completely healthy while never having delivered a
 * single alert - which is precisely what happened when the production compose
 * file did not pass these variables through. One line at boot makes the gap
 * visible before an incident does.
 */
/**
 * Register a repeatable job, dropping any earlier schedule for the same job
 * whose cron pattern no longer matches.
 *
 * BullMQ keys a repeatable by (name, pattern, ...), NOT by the jobId we pass.
 * Adding the same job with a changed pattern therefore does not update the
 * schedule - it registers a SECOND one, and the old cron keeps firing forever
 * alongside the new one. Nothing surfaces that: both run, the logs look normal,
 * and the only symptom is a job running more often than its configuration says.
 * The comment this replaces claimed the add was "idempotent - BullMQ dedupes by
 * repeat key", which is true only while the pattern never changes.
 *
 * Tuning a cron is an ordinary operation (ONIONOO_POLL_CRON is documented in
 * .env.example precisely so it can be changed), so the cleanup belongs here
 * rather than in a runbook step someone has to remember.
 */
async function scheduleRepeatable(
  queue: Queue,
  name: string,
  pattern: string,
  jobId: string,
): Promise<void> {
  for (const existing of await queue.getRepeatableJobs()) {
    if (existing.name === name && existing.pattern !== pattern) {
      await queue.removeRepeatableByKey(existing.key);
      log(`removed stale schedule for '${name}' (was cron='${existing.pattern}')`);
    }
  }
  await queue.add(name, {}, { repeat: { pattern }, jobId });
  log(`scheduled repeatable job '${name}' cron='${pattern}'`);
}

/**
 * Record that a repeatable job completed a cycle without throwing.
 *
 * Read by the header chip to answer "is the pipeline alive", which consensus age
 * cannot answer on its own: Onionoo republishes about an hour behind the
 * consensus it serves, so healthy data is always 1-2h old and a stalled poll
 * looks identical to a working one until someone goes digging.
 *
 * Best-effort on purpose - a failed heartbeat write must never fail the job that
 * already did its real work.
 */
async function recordIngestSuccess(
  db: ReturnType<typeof getDb>,
  job: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .insert(ingestStatus)
      .values({ job, lastSuccessAt: new Date(), detail })
      .onConflictDoUpdate({
        target: ingestStatus.job,
        set: { lastSuccessAt: new Date(), detail },
      });
  } catch (err) {
    log(`heartbeat write failed for ${job}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function logAlertChannels(): void {
  // A host without credentials is NOT ready: nodemailer builds a transport and
  // then fails authentication on every send. Reporting that as "ready" would
  // reproduce, in the diagnostics themselves, the exact failure this line exists
  // to surface.
  const smtp = !process.env.SMTP_HOST
    ? 'OFF (no SMTP_HOST)'
    : process.env.SMTP_USER && process.env.SMTP_PASS
      ? 'ready'
      : 'INCOMPLETE (host set, no SMTP_USER/SMTP_PASS - sends will fail auth)';
  const state = [
    `email=${smtp}`,
    `telegram=${process.env.TELEGRAM_BOT_TOKEN ? 'ready' : 'OFF (no TELEGRAM_BOT_TOKEN)'}`,
    // The webhook channel needs no config of its own: the target is the rule's
    // own `webhook:<url>`. It is listed so the boot line covers all three.
    'webhook=ready (per-rule url)',
  ].join(' · ');
  log(`alert channels: ${state}`);
}

main().catch((err) => {
  console.error('[ingestion] fatal:', err);
  process.exit(1);
});
