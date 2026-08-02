import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend zod with `.openapi()` metadata. Must run before any schema below.
extendZodWithOpenApi(z);

/**
 * Tor-Sockets public API schemas (v1).
 *
 * These define the contract of `/api/v1/*` REST endpoints and are used both to
 * validate request query params and to generate the OpenAPI document served at
 * `/api/v1/openapi.json`. Response shapes are intentionally a stable subset of
 * the Onionoo model - see `onionoo.ts` for the full upstream schema.
 */

// --- Shared primitives ---

/**
 * Boolean from a query string. zod's built-in `z.coerce.boolean()` treats any
 * non-empty string (including "false") as true, which is wrong for query params.
 * This accepts "true"/"1" → true and "false"/"0" → false.
 */
const booleanQuery = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '1';
  return undefined;
}, z.boolean());

const isoTimestamp = z.string().datetime().openapi('ISO8601 timestamp, UTC');

const dimensionEnum = z
  .enum(['country', 'as', 'hoster', 'family'])
  .openapi('ConcentrationDimension');

const flagEnum = z
  .enum([
    'Authority',
    'BadExit',
    'Exit',
    'Fast',
    'Guard',
    'HSDir',
    'NoEdConsensus',
    'Running',
    'Stable',
    'StaleDesc',
    'Sybil',
    'Valid',
    'V2Dir',
  ])
  .openapi('RelayFlag');

// --- Query schemas (request validation) ---

export const relaysQuerySchema = z
  .object({
    running: booleanQuery.optional().openapi({ description: 'Filter by running status' }),
    country: z
      .string()
      .length(2)
      .optional()
      .openapi({ description: 'ISO 3166-1 alpha-2 country code (e.g. "DE")' }),
    asNumber: z.string().optional().openapi({ description: 'AS number (e.g. "AS24940")' }),
    flag: flagEnum.optional().openapi({ description: 'Require this consensus flag' }),
    search: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .openapi({ description: 'Substring match on nickname or fingerprint' }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .openapi({ description: 'Page size (max 200)', default: 50 }),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .openapi({ description: 'Pagination offset', default: 0 }),
    sort: z
      .enum(['consensus_weight', 'guard_probability', 'exit_probability', 'country', 'nickname'])
      .default('consensus_weight')
      .openapi({ description: 'Sort field', default: 'consensus_weight' }),
    order: z
      .enum(['asc', 'desc'])
      .default('desc')
      .openapi({ description: 'Sort direction', default: 'desc' }),
  })
  .openapi('RelaysQuery');

export const concentrationQuerySchema = z
  .object({
    dimension: dimensionEnum
      .default('country')
      .openapi({ description: 'Group relays by this dimension', default: 'country' }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .default(50)
      .openapi({ description: 'Top-N keys by consensus weight (max 500)', default: 50 }),
  })
  .openapi('ConcentrationQuery');

// --- Response schemas ---

export const relaySummarySchema = z
  .object({
    fingerprint: z.string().regex(/^[0-9A-F]{40}$/),
    nickname: z.string(),
    running: z.boolean(),
    country: z.string().nullable(),
    country_name: z.string().nullable(),
    as_number: z.string().nullable(),
    as_name: z.string().nullable(),
    consensus_weight: z.number().int(),
    guard_probability: z.number().nullable(),
    middle_probability: z.number().nullable(),
    exit_probability: z.number().nullable(),
    flags: z.array(z.string()),
    first_seen: isoTimestamp,
    last_seen: isoTimestamp,
  })
  .openapi('RelaySummary');

export const relaysResponseSchema = z
  .object({
    relays: z.array(relaySummarySchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi('RelaysResponse');

export const relayDetailSchema = relaySummarySchema
  .extend({
    contact: z.string().nullable(),
    version: z.string().nullable(),
    platform: z.string().nullable(),
    or_addresses: z.array(z.string()),
    exit_addresses: z.array(z.string()),
    dir_address: z.string().nullable(),
    advertised_bandwidth: z.number().int().nullable(),
    observed_bandwidth: z.number().int().nullable(),
    overload_general_timestamp: isoTimestamp.nullable(),
    effective_family: z.array(z.string()),
    alleged_family: z.array(z.string()),
    consensus_weight_fraction: z.number().nullable(),
    measured: z.boolean().nullable(),
    recommended_version: z.boolean().nullable(),
    version_status: z.string().nullable(),
    last_restarted: isoTimestamp.nullable(),
  })
  .openapi('RelayDetail');

export const concentrationKeySchema = z
  .object({
    key: z.string(),
    label: z
      .string()
      .nullable()
      .optional()
      .openapi({ description: 'Human label for the key (e.g. family nickname); null if none' }),
    relay_count: z.number().int(),
    guard_weight_pct: z.number().nullable(),
    middle_weight_pct: z.number().nullable(),
    exit_weight_pct: z.number().nullable(),
    consensus_weight_sum: z.number().int(),
  })
  .openapi('ConcentrationKey');

export const hhiRoleEnum = z.enum(['consensus', 'guard', 'middle', 'exit']).openapi('HhiRole');

export const decentralizationSchema = z
  .object({
    cr1: z.number().openapi({ description: 'Cumulative share of the top entity (0..1)' }),
    cr3: z.number().openapi({ description: 'Cumulative share of the top 3 (0..1)' }),
    cr5: z.number().openapi({ description: 'Cumulative share of the top 5 (0..1)' }),
    nakamoto: z
      .number()
      .int()
      .openapi({ description: 'Min entities controlling >50% (Nakamoto coefficient)' }),
  })
  .openapi('Decentralization');

export const decentralizationByRoleSchema = z
  .object({
    consensus: decentralizationSchema,
    guard: decentralizationSchema,
    middle: decentralizationSchema,
    exit: decentralizationSchema,
  })
  .openapi('DecentralizationByRole');

export const hhiByRoleSchema = z
  .object({
    consensus: z.number(),
    guard: z.number(),
    middle: z.number(),
    exit: z.number(),
  })
  .openapi('HhiByRole', {
    description:
      'HHI per path-selection role. Exit is usually far higher than consensus - fewer operators run exits (legal risk), so exit capacity is more concentrated (the real threat-model number).',
  });

export const concentrationResponseSchema = z
  .object({
    time: isoTimestamp,
    dimension: dimensionEnum,
    hhi: z.number().openapi({
      description:
        'Herfindahl-Hirschman Index by consensus weight (0..10000), equal to 10000/N for N equal-sized operators: <1000 is 10 or more, 1000-2000 is five to ten, >2000 is fewer than five. See hhi_by_role for the exit/guard breakdown.',
    }),
    hhi_by_role: hhiByRoleSchema,
    decentralization_by_role: decentralizationByRoleSchema,
    total_relays: z.number().int(),
    total_consensus_weight: z.number().int(),
    keys: z
      .array(concentrationKeySchema)
      .openapi({ description: 'Top-N keys by consensus weight' }),
  })
  .openapi('ConcentrationResponse');

// --- Family (operator concentration) ---

export const familiesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50).openapi({ default: 50 }),
    offset: z.coerce.number().int().min(0).default(0).openapi({ default: 0 }),
  })
  .openapi('FamiliesQuery');

export const familySummarySchema = z
  .object({
    key: z.string().openapi({ description: 'Canonical family id (smallest member fingerprint)' }),
    label: z.string().nullable().openapi({ description: 'Nickname of the canonical relay' }),
    relay_count: z.number().int(),
    consensus_weight_sum: z.number().int(),
    guard_weight_pct: z.number().nullable(),
    middle_weight_pct: z.number().nullable(),
    exit_weight_pct: z.number().nullable(),
  })
  .openapi('FamilySummary');

export const familiesResponseSchema = z
  .object({
    time: isoTimestamp,
    hhi: z.number().openapi({ description: 'Family-dimension HHI (0..10000)' }),
    total_families: z.number().int().openapi({ description: 'Families of size ≥ 2' }),
    families: z.array(familySummarySchema),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi('FamiliesResponse');

export const familyAsBreakdownSchema = z
  .object({
    as_number: z.string().nullable(),
    as_name: z.string().nullable(),
    relay_count: z.number().int(),
  })
  .openapi('FamilyAsBreakdown');

export const familyDetailSchema = z
  .object({
    key: z.string(),
    label: z.string().nullable(),
    relay_count: z.number().int(),
    consensus_weight_sum: z.number().int(),
    guard_weight_pct: z.number().nullable(),
    middle_weight_pct: z.number().nullable(),
    exit_weight_pct: z.number().nullable(),
    countries: z.array(z.string()).openapi({ description: 'Distinct ISO country codes spanned' }),
    autonomous_systems: z
      .array(familyAsBreakdownSchema)
      .openapi({ description: 'AS spread, by relay count' }),
    members: z.array(relaySummarySchema),
  })
  .openapi('FamilyDetail');

// --- Version / EOL distribution ---

export const versionStatusBucketSchema = z
  .object({
    status: z.string().nullable().openapi({
      description: 'Onionoo version_status: recommended | experimental | obsolete | unrecommended',
    }),
    relays: z.number().int(),
    consensus_weight: z.number().int(),
    relays_pct: z.number(),
    weight_pct: z.number(),
  })
  .openapi('VersionStatusBucket');

export const versionEntrySchema = z
  .object({
    version: z.string(),
    recommended: z.boolean().nullable(),
    relays: z.number().int(),
    consensus_weight: z.number().int(),
    relays_pct: z.number(),
    weight_pct: z.number(),
  })
  .openapi('VersionEntry');

export const versionsResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    total_relays: z.number().int(),
    total_consensus_weight: z.number().int(),
    recommended: z
      .object({
        relays: z.number().int(),
        consensus_weight: z.number().int(),
        relays_pct: z.number(),
        weight_pct: z.number(),
      })
      .openapi({ description: 'Relays flagged recommended_version by the consensus' }),
    by_status: z.array(versionStatusBucketSchema),
    top_versions: z.array(versionEntrySchema),
  })
  .openapi('VersionsResponse');

// --- Overload signal ---

const countryOverloadSchema = z
  .object({
    country: z.string().nullable(),
    overloaded_relays: z.number().int(),
    relays: z.number().int(),
    overloaded_pct: z.number(),
  })
  .openapi('CountryOverload');

export const overloadResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    total_relays: z.number().int(),
    total_consensus_weight: z.number().int(),
    overloaded_relays: z.number().int(),
    overloaded_consensus_weight: z.number().int(),
    overloaded_relays_pct: z.number(),
    overloaded_weight_pct: z.number(),
    by_country: z.array(countryOverloadSchema),
  })
  .openapi('OverloadResponse');

// --- IPv6 support ---

const countryIpv6Schema = z
  .object({
    country: z.string().nullable(),
    ipv6_relays: z.number().int(),
    relays: z.number().int(),
    ipv6_pct: z.number(),
  })
  .openapi('CountryIpv6');

export const ipv6ResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    total_relays: z.number().int(),
    total_consensus_weight: z.number().int(),
    ipv6_relays: z.number().int(),
    ipv6_consensus_weight: z.number().int(),
    ipv6_relays_pct: z.number(),
    ipv6_weight_pct: z.number(),
    ipv6_guard_relays: z.number().int(),
    ipv6_exit_relays: z.number().int(),
    by_country: z.array(countryIpv6Schema),
  })
  .openapi('Ipv6Response');

// --- Bandwidth: measured vs advertised ---

const unmeasuredRelaySchema = z
  .object({
    fingerprint: z.string(),
    nickname: z.string(),
    consensus_weight: z.number().int(),
    advertised_bandwidth: z.number().int().nullable(),
  })
  .openapi('UnmeasuredRelay');

export const bandwidthResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    total_relays: z.number().int(),
    total_consensus_weight: z.number().int(),
    measured_relays: z.number().int(),
    measured_consensus_weight: z.number().int(),
    measured_relays_pct: z.number(),
    measured_weight_pct: z.number(),
    unmeasured_relays: z.number().int(),
    unmeasured_consensus_weight: z.number().int(),
    advertised_bandwidth_sum: z.number().int(),
    observed_bandwidth_sum: z.number().int(),
    top_unmeasured: z.array(unmeasuredRelaySchema),
  })
  .openapi('BandwidthResponse');

// --- HHI trend (multi-day slope from concentration_snapshots) ---

const hhiTrendPointSchema = z
  .object({ time: isoTimestamp, hhi: z.number() })
  .openapi('HhiTrendPoint');

const hhiDimensionTrendSchema = z
  .object({
    dimension: z.string(),
    latest_hhi: z.number(),
    earliest_hhi: z.number(),
    delta: z.number(),
    slope_per_day: z.number(),
    direction: z.enum(['rising', 'falling', 'flat']),
    points: z.array(hhiTrendPointSchema),
  })
  .openapi('HhiDimensionTrend');

export const hhiTrendResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    window_days: z.number().int(),
    role: hhiRoleEnum.openapi({
      description: 'Path-selection role the HHI series is computed for',
    }),
    dimensions: z.array(hhiDimensionTrendSchema),
  })
  .openapi('HhiTrendResponse');

// --- Network history (relay_history time series) ---

const networkHistoryPointSchema = z
  .object({
    time: isoTimestamp,
    relays_running: z.number().int(),
    relays_stopped: z.number().int(),
    relays_seen: z.number().int(),
    consensus_weight: z.number(),
    advertised_bandwidth: z.number(),
    guard_bandwidth: z.number(),
    middle_bandwidth: z.number(),
    exit_bandwidth: z.number(),
  })
  .openapi('NetworkHistoryPoint');

export const networkHistoryResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    window_days: z.number().int(),
    points: z.array(networkHistoryPointSchema),
  })
  .openapi('NetworkHistoryResponse');

export type NetworkHistoryResponse = z.infer<typeof networkHistoryResponseSchema>;

// --- Exit scarcity (key ports) ---

const countryExitSchema = z
  .object({
    country: z.string().nullable(),
    exit_relays: z.number().int(),
    exit_consensus_weight: z.number().int(),
  })
  .openapi('CountryExit');

const exitPortSchema = z
  .object({
    port: z.number().int(),
    name: z.string(),
    relays: z.number().int(),
    as_count: z.number().int().openapi({ description: 'Distinct ASes allowing this port' }),
    exit_weight_pct: z.number().openapi({ description: 'Share of exit capacity allowing it' }),
  })
  .openapi('ExitPort');

export const exitsResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    total_relays: z.number().int(),
    total_consensus_weight: z.number().int(),
    exit_relays: z.number().int(),
    exit_consensus_weight: z.number().int(),
    exit_weight_pct: z.number(),
    exits_port_443: z.number().int(),
    exits_port_443_weight: z.number().int(),
    exits_port_80: z.number().int(),
    exits_port_80_weight: z.number().int(),
    exits_both_ports: z.number().int(),
    by_country: z.array(countryExitSchema),
    port_diversity: z
      .array(exitPortSchema)
      .openapi({ description: 'Per-port exit capacity + operator diversity (fewest ASes first)' }),
  })
  .openapi('ExitsResponse');

// --- Hidden / undeclared operator families ---

const asBreakdownSchema = z
  .object({ as_number: z.string(), relays: z.number().int() })
  .openapi('HiddenFamilyAsBreakdown');

const hiddenFamilyClusterSchema = z
  .object({
    contact: z.string(),
    verified: z.boolean().openapi({
      description: 'Operator cryptographically proved contact ownership (proof:*-rsa)',
    }),
    relays: z.number().int(),
    declared_families: z
      .number()
      .int()
      .openapi({ description: 'Distinct declared effective_family components (size ≥ 2)' }),
    declared_family_sizes: z
      .array(z.number().int())
      .openapi({ description: 'Size of each declared family in the group (largest first)' }),
    undeclared_relays: z.number().int().openapi({ description: 'Members declaring no family' }),
    consensus_weight: z.number().int(),
    guard_pct: z.number(),
    middle_pct: z.number(),
    exit_pct: z.number(),
    deanon_risk: z.number().openapi({
      description: 'guardShare × exitShare - P(a random circuit uses this operator on both ends)',
    }),
    as_breakdown: z.array(asBreakdownSchema),
    as_numbers: z.array(z.string()),
    countries: z.array(z.string()),
    sample_fingerprints: z.array(z.string()),
  })
  .openapi('HiddenFamilyCluster');

export const hiddenFamiliesResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    min_relays: z.number().int(),
    total_clusters: z.number().int(),
    clusters: z.array(hiddenFamilyClusterSchema),
  })
  .openapi('HiddenFamiliesResponse');

// --- Guard↔exit correlation risk (AS-level threat model) ---

export const correlationDimensionEnum = z
  .enum(['as', 'country', 'hoster'])
  .openapi('CorrelationDimension');

const correlationKeySchema = z
  .object({
    key: z.string(),
    label: z
      .string()
      .nullable()
      .openapi({ description: 'Human name (AS/country name); null if none' }),
    operator: z
      .string()
      .nullable()
      .openapi({ description: 'Dominant operator contact by exit weight in this entity' }),
    verified: z
      .boolean()
      .openapi({ description: 'Dominant operator cryptographically proved contact (proof:*-rsa)' }),
    guard_share: z.number().openapi({ description: 'Share of network guard probability (0..1)' }),
    exit_share: z.number().openapi({ description: 'Share of network exit probability (0..1)' }),
    risk: z.number().openapi({ description: 'guard_share × exit_share for this entity' }),
  })
  .openapi('CorrelationKey');

export const correlationQuerySchema = z
  .object({
    dimension: correlationDimensionEnum
      .default('as')
      .openapi({ description: 'Group by this entity', default: 'as' }),
  })
  .openapi('CorrelationQuery');

export const correlationResponseSchema = z
  .object({
    computed_at: isoTimestamp,
    dimension: correlationDimensionEnum,
    total_risk: z.number().openapi({
      description:
        'Σ guard_share×exit_share - probability a random circuit has the same entity on both the guard and the exit (end-to-end correlation exposure).',
    }),
    top: z.array(correlationKeySchema),
  })
  .openapi('CorrelationResponse');

export const statsResponseSchema = z
  .object({
    relays_total: z.number().int(),
    relays_running: z.number().int(),
    relays_stopped: z.number().int(),
    consensus_weight_sum: z.number().int(),
    countries: z.number().int(),
    autonomous_systems: z.number().int(),
    hosters: z.number().int(),
    last_consensus: isoTimestamp.nullable(),
    computed_at: isoTimestamp,
  })
  .openapi('StatsResponse');

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  })
  .openapi('ErrorResponse');

// --- Inferred TypeScript types ---

export type RelaysQuery = z.infer<typeof relaysQuerySchema>;
export type ConcentrationQuery = z.infer<typeof concentrationQuerySchema>;
export type RelaySummary = z.infer<typeof relaySummarySchema>;
export type RelaysResponse = z.infer<typeof relaysResponseSchema>;
export type RelayDetail = z.infer<typeof relayDetailSchema>;
export type ConcentrationKey = z.infer<typeof concentrationKeySchema>;
export type FamiliesQuery = z.infer<typeof familiesQuerySchema>;
export type FamilySummary = z.infer<typeof familySummarySchema>;
export type FamiliesResponse = z.infer<typeof familiesResponseSchema>;
export type FamilyDetail = z.infer<typeof familyDetailSchema>;
export type VersionsResponse = z.infer<typeof versionsResponseSchema>;
export type OverloadResponse = z.infer<typeof overloadResponseSchema>;
export type Ipv6Response = z.infer<typeof ipv6ResponseSchema>;
export type BandwidthResponse = z.infer<typeof bandwidthResponseSchema>;
export type HhiTrendResponse = z.infer<typeof hhiTrendResponseSchema>;
export type HhiRole = z.infer<typeof hhiRoleEnum>;
export type HhiByRole = z.infer<typeof hhiByRoleSchema>;
export type ExitsResponse = z.infer<typeof exitsResponseSchema>;
export type HiddenFamiliesResponse = z.infer<typeof hiddenFamiliesResponseSchema>;
export type HiddenFamilyCluster = z.infer<typeof hiddenFamilyClusterSchema>;
export type CorrelationResponse = z.infer<typeof correlationResponseSchema>;
export type CorrelationDimension = z.infer<typeof correlationDimensionEnum>;
export type ConcentrationResponse = z.infer<typeof concentrationResponseSchema>;
export type Decentralization = z.infer<typeof decentralizationSchema>;
export type DecentralizationByRole = z.infer<typeof decentralizationByRoleSchema>;
export type StatsResponse = z.infer<typeof statsResponseSchema>;
