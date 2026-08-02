import { jsonResponse } from '@/lib/api/handler';
import { getHhiTrend } from '@/lib/api/queries';
import type { HhiRole } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

const ROLES: HhiRole[] = ['consensus', 'guard', 'middle', 'exit'];

/**
 * GET /api/v1/trends?role=consensus|guard|middle|exit
 * multi-day HHI concentration trend per dimension, for a path-selection
 * role. Exit HHI over time answers "is the exit network centralizing?".
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('role');
  const role = ROLES.includes(raw as HhiRole) ? (raw as HhiRole) : 'consensus';
  const db = getDb(process.env.DATABASE_URL);
  const result = await getHhiTrend(db, { role });
  return jsonResponse(result, 60);
}
