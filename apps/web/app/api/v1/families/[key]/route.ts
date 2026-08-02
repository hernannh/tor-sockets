import { jsonResponse, notFound } from '@/lib/api/handler';
import { getFamilyDetail } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/families/{key}
 * One operator family by canonical id (the smallest member fingerprint, 40 hex).
 * Returns member relays + the AS/country spread of the family.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[0-9A-Fa-f]{40}$/.test(key)) {
    return Response.json(
      { error: { code: 'invalid_key', message: 'family key must be a 40 hex-char fingerprint' } },
      { status: 400 },
    );
  }
  const db = getDb(process.env.DATABASE_URL);
  const family = await getFamilyDetail(db, key);
  if (!family) return notFound('family not found');
  return jsonResponse(family, 60);
}
