import type { OnionooDetailsResponse } from '@tor-sockets/api-contract';
import { onionooDetailsResponseSchema } from '@tor-sockets/api-contract';

/**
 * Subset of Onionoo `/details` fields we persist. Limiting via the `fields`
 * parameter cuts the payload from ~10MB to ~3MB for ~7000 relays.
 */
export const RELAY_FIELDS = [
  'fingerprint',
  'hashed_fingerprint',
  'nickname',
  'first_seen',
  'last_seen',
  'last_restarted',
  'last_changed_address_or_port',
  'running',
  'hibernating',
  'flags',
  'or_addresses',
  'exit_addresses',
  'dir_address',
  'country',
  'country_name',
  'city_name',
  'latitude',
  'longitude',
  'as',
  'as_name',
  'consensus_weight',
  'consensus_weight_fraction',
  'guard_probability',
  'middle_probability',
  'exit_probability',
  'measured',
  'advertised_bandwidth',
  'bandwidth_rate',
  'bandwidth_burst',
  'observed_bandwidth',
  'overload_general_timestamp',
  'contact',
  'platform',
  'version',
  'recommended_version',
  'version_status',
  'exit_policy_summary',
  'effective_family',
  'alleged_family',
  'indirect_family',
  'verified_host_names',
  'unreachable_or_addresses',
].join(',');

export type FetchOutcome =
  | { status: 'ok'; data: OnionooDetailsResponse; lastModified?: string; publishedAt: Date }
  | { status: 'not_modified' };

export interface FetchOptions {
  baseUrl?: string;
  lastModified?: string;
  signal?: AbortSignal;
  /** Optional limit on number of relays (useful for smoke tests). */
  limit?: number;
}

/**
 * Fetch all running + non-running relays from Onionoo `/details`.
 *
 * Honours `If-Modified-Since` (Onionoo returns 304 when nothing changed),
 * and validates the JSON payload against the zod schema before returning.
 *
 * Throws on non-2xx (other than 304) or schema validation errors.
 */
export async function fetchRelayDetails(opts: FetchOptions = {}): Promise<FetchOutcome> {
  const baseUrl = (
    opts.baseUrl ??
    process.env.ONIONOO_BASE_URL ??
    'https://onionoo.torproject.org'
  ).replace(/\/$/, '');
  const url = new URL('/details', `${baseUrl}/`);
  url.searchParams.set('type', 'relay');
  url.searchParams.set('fields', RELAY_FIELDS);
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));

  const headers: Record<string, string> = {
    'Accept-Encoding': 'gzip',
    'User-Agent': 'tor-sockets-ingestion/0.1',
  };
  if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;

  const res = await fetch(url, { headers, signal: opts.signal });
  if (res.status === 304) return { status: 'not_modified' };
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Onionoo HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json: unknown = await res.json();
  const parsed = onionooDetailsResponseSchema.parse(json);
  const lastModified = res.headers.get('last-modified') ?? undefined;

  return {
    status: 'ok',
    data: parsed,
    lastModified,
    publishedAt: parseOnionooTimestamp(parsed.relays_published),
  };
}

/**
 * Parse an Onionoo UTC timestamp ("YYYY-MM-DD HH:MM:SS") into a Date.
 * Onionoo timestamps are always UTC but lack a zone designator.
 */
export function parseOnionooTimestamp(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}
