import { jsonResponse } from '@/lib/api/handler';
import { getExits } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/exits
 * exit capacity and how many exits allow the scarce key ports (80/443).
 */
export async function GET() {
  const db = getDb(process.env.DATABASE_URL);
  const result = await getExits(db);
  return jsonResponse(result, 60);
}
