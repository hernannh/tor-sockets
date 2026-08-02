import { peeringdbNetResponseSchema, peeringdbOrgResponseSchema } from '@tor-sockets/api-contract';

/**
 * PeeringDB adapter - builds the ASN → organization mapping used to group
 * relays by real hoster (see `packages/analysis` hoster dimension).
 *
 * PeeringDB models a *network* (`/api/net`, one per ASN) belonging to an
 * *organization* (`/api/org`). A hosting company (OVH, Hetzner…) is one org
 * spanning several networks/ASNs, so we resolve `asn → net.org_id → org.name`.
 * Coverage is partial (networks self-register); ASNs absent here fall back to
 * the AS name downstream.
 */

const DEFAULT_BASE_URL = 'https://www.peeringdb.com';

export interface AsOrgMapping {
  /** `"AS<n>"`, matching `relays.as_number`. */
  asNumber: string;
  orgId: string;
  orgName: string;
}

export interface FetchAsOrgOptions {
  baseUrl?: string;
  /** Optional PeeringDB API key - raises the anonymous rate limit. */
  apiKey?: string;
  signal?: AbortSignal;
}

/**
 * Fetch every PeeringDB network + org and return one mapping per ASN. Throws on
 * non-2xx or schema-validation failure. Deduplicates by ASN (last wins).
 */
export async function fetchAsOrgMappings(opts: FetchAsOrgOptions = {}): Promise<AsOrgMapping[]> {
  const base = (opts.baseUrl ?? process.env.PEERINGDB_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const apiKey = opts.apiKey ?? process.env.PEERINGDB_API_KEY;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'tor-sockets-ingestion/0.1',
  };
  if (apiKey) headers.Authorization = `Api-Key ${apiKey}`;

  const [nets, orgs] = await Promise.all([
    fetchJson(`${base}/api/net?fields=asn,org_id,name`, headers, opts.signal).then(
      (j) => peeringdbNetResponseSchema.parse(j).data,
    ),
    fetchJson(`${base}/api/org?fields=id,name`, headers, opts.signal).then(
      (j) => peeringdbOrgResponseSchema.parse(j).data,
    ),
  ]);

  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const byAsn = new Map<string, AsOrgMapping>();
  for (const net of nets) {
    if (net.asn <= 0) continue;
    byAsn.set(`AS${net.asn}`, {
      asNumber: `AS${net.asn}`,
      orgId: String(net.org_id),
      // Prefer the org name (groups all the org's ASNs); fall back to net name.
      orgName: orgName.get(net.org_id) ?? net.name,
    });
  }
  return [...byAsn.values()];
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PeeringDB HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}
