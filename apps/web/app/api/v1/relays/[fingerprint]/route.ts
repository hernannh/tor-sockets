import { jsonResponse, notFound } from '@/lib/api/handler';
import { getRelayByFingerprint } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/relays/{fingerprint}
 * Full detail for a single relay (40-char hex fingerprint, uppercase).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fingerprint: string }> },
) {
  const { fingerprint } = await params;
  if (!/^[0-9A-Fa-f]{40}$/.test(fingerprint)) {
    return Response.json(
      { error: { code: 'invalid_fingerprint', message: 'fingerprint must be 40 hex chars' } },
      { status: 400 },
    );
  }
  const db = getDb(process.env.DATABASE_URL);
  const relay = await getRelayByFingerprint(db, fingerprint);
  if (!relay) return notFound('relay not found');
  return jsonResponse(relay, 300);
}
