import { jsonResponse, parseQuery } from '@/lib/api/handler';
import { getRelays } from '@/lib/api/queries';
import { relaysQuerySchema } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/relays?running=&country=&asNumber=&flag=&search=&limit=&offset=
 * Paginated relay directory with filters. Ordered by consensus_weight DESC.
 */
export async function GET(request: NextRequest) {
  const parsed = parseQuery(relaysQuerySchema, request.nextUrl.searchParams);
  if (!parsed.success) return parsed.response;
  const db = getDb(process.env.DATABASE_URL);
  const result = await getRelays(db, parsed.data);
  return jsonResponse(result, 60);
}
