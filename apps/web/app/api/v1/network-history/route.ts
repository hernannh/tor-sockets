import { jsonResponse } from '@/lib/api/handler';
import { getNetworkHistory } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/network-history?days=14
 * Hourly relay / consensus-weight / advertised-bandwidth time series for the
 * whole network, aggregated from the relay_history hypertable.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('days');
  const parsed = Number.parseInt(raw ?? '', 10);
  const days = Number.isFinite(parsed) && parsed >= 1 && parsed <= 90 ? parsed : 14;
  const db = getDb(process.env.DATABASE_URL);
  const result = await getNetworkHistory(db, { days });
  return jsonResponse(result, 60);
}
