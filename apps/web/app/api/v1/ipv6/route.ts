import { jsonResponse } from '@/lib/api/handler';
import { getIpv6 } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/ipv6
 * dual-stack (IPv6) adoption across the running relay set.
 */
export async function GET() {
  const db = getDb(process.env.DATABASE_URL);
  const result = await getIpv6(db);
  return jsonResponse(result, 60);
}
