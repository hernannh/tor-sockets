import { getInstance } from '@/lib/federation';
import { federationLog, getDb } from '@tor-sockets/db';
import { signEnvelope } from '@tor-sockets/federation';
import { asc, gt } from 'drizzle-orm';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const changesQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

/**
 * GET /federation/v1/changes?since={seq}&limit={n}
 *
 * Signed CDC log: returns federation_log entries with seq > `since`, ordered
 * ascending. Peers poll this to track what the instance did (consensus
 * processed, concentration snapshots, future anomaly detections) without
 * re-fetching the full relay set.
 *
 * `next_since` in the payload is the cursor for the next page: if non-null,
 * the client should re-request with `since=<next_since>` to continue. Null
 * means the peer is caught up.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = changesQuerySchema.safeParse(Object.fromEntries(params.entries()));
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: 'invalid_query',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      },
      { status: 400 },
    );
  }
  const { since, limit } = parsed.data;

  const instance = await getInstance();
  const db = getDb(process.env.DATABASE_URL);

  // Fetch limit+1 to detect whether more pages exist.
  const rows = await db
    .select()
    .from(federationLog)
    .where(gt(federationLog.seq, BigInt(since)))
    .orderBy(asc(federationLog.seq))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const lastSeq = page.length > 0 ? Number(page[page.length - 1].seq) : since;

  const payload = {
    since,
    count: page.length,
    next_since: hasMore ? lastSeq + 1 : null,
    changes: page.map((r) => ({
      seq: Number(r.seq),
      instance_id: r.instanceId,
      op: r.op,
      payload: r.payload,
      payload_hash: r.payloadHash,
      sig: r.sig,
      created_at: r.createdAt.toISOString(),
    })),
  };

  const envelope = await signEnvelope(payload, instance.keypair, instance.uri);
  return Response.json(envelope, {
    headers: { 'cache-control': 'no-store' },
  });
}
