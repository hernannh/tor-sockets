import { type Database, asOrg } from '@tor-sockets/db';
import { type FetchAsOrgOptions, fetchAsOrgMappings } from '@tor-sockets/ingestion-core';
import { sql } from 'drizzle-orm';

export interface PeeringdbSyncResult {
  status: 'ok' | 'empty';
  fetched: number;
  upserted: number;
  durationMs: number;
}

/**
 * Refresh the `as_org` table from PeeringDB. Full replace-by-upsert: every ASN
 * PeeringDB knows is upserted; rows for ASNs that vanish upstream are left as-is
 * (harmless - the hoster dimension falls back to AS name only when no row).
 *
 * Runs on a slow cadence (PeeringDB changes rarely); a failed run leaves the
 * previous mapping intact.
 */
export async function runPeeringdbSync(
  db: Database,
  opts: FetchAsOrgOptions = {},
): Promise<PeeringdbSyncResult> {
  const start = Date.now();
  const mappings = await fetchAsOrgMappings(opts);

  if (mappings.length === 0) {
    return { status: 'empty', fetched: 0, upserted: 0, durationMs: Date.now() - start };
  }

  const now = new Date();
  const rows = mappings.map((m) => ({
    asNumber: m.asNumber,
    orgId: m.orgId,
    orgName: m.orgName,
    source: 'peeringdb',
    updatedAt: now,
  }));

  // Chunk to stay under the postgres 65535-parameter cap (5 cols × N rows).
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(asOrg)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: asOrg.asNumber,
        set: {
          orgId: sql`excluded.org_id`,
          orgName: sql`excluded.org_name`,
          source: sql`excluded.source`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return {
    status: 'ok',
    fetched: mappings.length,
    upserted: rows.length,
    durationMs: Date.now() - start,
  };
}
