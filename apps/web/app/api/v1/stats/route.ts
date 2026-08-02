import { jsonResponse } from '@/lib/api/handler';
import { getStats } from '@/lib/api/queries';
import { statsResponseSchema } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/stats
 * Aggregate network statistics for the latest consensus.
 */
export async function GET() {
  const db = getDb(process.env.DATABASE_URL);
  const stats = await getStats(db);
  return jsonResponse(statsResponseSchema.parse(stats), 60);
}
