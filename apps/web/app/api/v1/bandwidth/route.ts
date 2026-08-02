import { jsonResponse } from '@/lib/api/handler';
import { getBandwidth } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/bandwidth
 * bandwidth measurement coverage (bwauth-measured vs self-advertised).
 */
export async function GET() {
  const db = getDb(process.env.DATABASE_URL);
  const result = await getBandwidth(db);
  return jsonResponse(result, 60);
}
