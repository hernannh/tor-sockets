import { jsonResponse } from '@/lib/api/handler';
import { getVersions } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/versions
 * Version / EOL distribution: share of the running network (by relay count and
 * consensus weight) on recommended vs obsolete Tor versions.
 */
export async function GET() {
  const db = getDb(process.env.DATABASE_URL);
  const result = await getVersions(db);
  return jsonResponse(result, 60);
}
