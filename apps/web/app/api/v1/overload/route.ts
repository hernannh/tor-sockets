import { jsonResponse } from '@/lib/api/handler';
import { getOverload } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/overload
 * share of running relays reporting a general overload condition.
 */
export async function GET() {
  const db = getDb(process.env.DATABASE_URL);
  const result = await getOverload(db);
  return jsonResponse(result, 60);
}
