import { getDb } from '@tor-sockets/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Lightweight liveness + readiness probe for container healthchecks and load
 * balancers. Distinct from the human-facing /health page (which runs several
 * heavy aggregates): this runs a single `SELECT 1` so it stays cheap and fast.
 * 200 = the process is up and the DB is reachable; 503 = DB unreachable.
 */
export async function GET() {
  try {
    const db = getDb(process.env.DATABASE_URL);
    await db.execute(sql`select 1`);
    return Response.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    console.error('[health] db probe failed', err);
    return Response.json({ status: 'degraded' }, { status: 503 });
  }
}
