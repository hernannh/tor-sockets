import { csvResponse, jsonResponse } from '@/lib/api/handler';
import { getCorrelationRisk } from '@/lib/api/queries';
import type { CorrelationDimension } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

const DIMS: CorrelationDimension[] = ['as', 'country', 'hoster'];

/**
 * GET /api/v1/correlation?dimension=as|country|hoster&format=json|csv
 * Guard↔exit correlation risk: P(the same entity is on both ends of a circuit).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const raw = params.get('dimension');
  const dimension = DIMS.includes(raw as CorrelationDimension)
    ? (raw as CorrelationDimension)
    : 'as';
  const db = getDb(process.env.DATABASE_URL);
  const result = await getCorrelationRisk(db, dimension);

  if (params.get('format') === 'csv') {
    return csvResponse(
      `correlation-${result.dimension}.csv`,
      ['key', 'label', 'operator', 'verified', 'guard_share', 'exit_share', 'risk'],
      result.top,
    );
  }
  return jsonResponse(result, 60);
}
