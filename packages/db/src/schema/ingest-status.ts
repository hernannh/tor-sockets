import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Liveness of the ingestion worker, one row per repeatable job.
 *
 * This exists because "how old is the data" and "is the pipeline alive" are
 * different questions, and the UI used to answer only the first. Our freshest
 * consensus is structurally 1-2h old - Onionoo republishes with roughly an hour
 * of lag - so consensus age alone cannot tell a healthy instance from one whose
 * poll has been failing all afternoon. Both look like "a couple of hours ago".
 *
 * The worker upserts `last_success_at` at the end of EVERY successful cycle,
 * including the 304 short-circuit where nothing changed: a conditional GET that
 * returns "not modified" is a healthy poll, and is in fact the common case
 * between hourly Onionoo updates.
 */
export const ingestStatus = pgTable('ingest_status', {
  /** Repeatable job name, e.g. `onionoo-poll`. */
  job: text('job').primaryKey(),
  /** End of the last cycle that completed without throwing. */
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }).notNull().defaultNow(),
  /** Free-form per-job context (relay counts, whether it was a 304, ...). */
  detail: jsonb('detail').$type<Record<string, unknown>>(),
});
