import { csvField, parseQuery } from '@/lib/api/handler';
import { getRelaysForExport } from '@/lib/api/queries';
import { relaysQuerySchema } from '@tor-sockets/api-contract';
import { getDb } from '@tor-sockets/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  'fingerprint',
  'nickname',
  'running',
  'country',
  'country_name',
  'as_number',
  'as_name',
  'consensus_weight',
  'guard_probability',
  'middle_probability',
  'exit_probability',
  'flags',
  'first_seen',
  'last_seen',
] as const;

const escapeCsv = csvField;
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  params.delete('limit');
  params.delete('offset');
  const parsed = parseQuery(relaysQuerySchema, params);
  if (!parsed.success) return parsed.response;

  const db = getDb(process.env.DATABASE_URL);
  const relays = await getRelaysForExport(db, parsed.data);

  const header = COLUMNS.join(',');
  const lines = relays.map((r) =>
    [
      r.fingerprint,
      r.nickname,
      r.running,
      r.country,
      r.country_name,
      r.as_number,
      r.as_name,
      r.consensus_weight,
      r.guard_probability,
      r.middle_probability,
      r.exit_probability,
      r.flags.join('|'),
      r.first_seen,
      r.last_seen,
    ]
      .map(escapeCsv)
      .join(','),
  );

  const csv = [header, ...lines].join('\n');
  const stamp = new Date().toISOString().slice(0, 19);

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="tor-sockets-relays-${stamp}.csv"`,
      'cache-control': 'public, max-age=60',
    },
  });
}
