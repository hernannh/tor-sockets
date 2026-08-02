import { csvResponse, jsonResponse } from '@/lib/api/handler';
import { getHiddenFamilies } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/hidden-families?format=json|csv
 * Suspected hidden operators: relays sharing a contact but not declared as one
 * effective_family. Ranked by deanon_risk = guardShare × exitShare.
 */
export async function GET(req: Request) {
  const db = getDb(process.env.DATABASE_URL);
  const result = await getHiddenFamilies(db);

  if (new URL(req.url).searchParams.get('format') === 'csv') {
    return csvResponse(
      'hidden-families.csv',
      [
        'contact',
        'verified',
        'relays',
        'declared_families',
        'undeclared_relays',
        'consensus_weight',
        'guard_pct',
        'exit_pct',
        'deanon_risk',
      ],
      result.clusters,
    );
  }
  return jsonResponse(result, 60);
}
