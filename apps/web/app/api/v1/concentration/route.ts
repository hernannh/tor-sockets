import { csvResponse, jsonResponse, notFound, parseQuery } from '@/lib/api/handler';
import { getConcentration } from '@/lib/api/queries';
import { concentrationQuerySchema } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/concentration?dimension={country|as|hoster|family}&limit={n}&format={json|csv}
 * Latest HHI snapshot for a dimension with top-N keys by consensus weight.
 */
export async function GET(request: NextRequest) {
  const parsed = parseQuery(concentrationQuerySchema, request.nextUrl.searchParams);
  if (!parsed.success) return parsed.response;
  const db = getDb(process.env.DATABASE_URL);
  const result = await getConcentration(db, parsed.data.dimension, parsed.data.limit);
  if (!result) return notFound('no concentration snapshots available - run ingestion first');

  if (request.nextUrl.searchParams.get('format') === 'csv') {
    return csvResponse(
      `concentration-${result.dimension}.csv`,
      [
        'key',
        'label',
        'relay_count',
        'consensus_weight_sum',
        'guard_weight_pct',
        'middle_weight_pct',
        'exit_weight_pct',
      ],
      result.keys,
    );
  }
  return jsonResponse(result, 60);
}
