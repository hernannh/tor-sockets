import { jsonResponse, notFound, parseQuery } from '@/lib/api/handler';
import { getFamilies } from '@/lib/api/queries';
import { familiesQuerySchema } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/families?limit={n}&offset={n}
 * Operator families (effective_family connected components, size ≥ 2) from the
 * latest snapshot, ranked by consensus weight. The unit of "who controls the
 * weight" - cuts across AS and country.
 */
export async function GET(request: NextRequest) {
  const parsed = parseQuery(familiesQuerySchema, request.nextUrl.searchParams);
  if (!parsed.success) return parsed.response;
  const db = getDb(process.env.DATABASE_URL);
  const result = await getFamilies(db, parsed.data);
  if (!result) return notFound('no family snapshots available - run ingestion first');
  return jsonResponse(result, 60);
}
