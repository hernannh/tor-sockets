import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas30';
import { type ZodTypeAny, z } from 'zod';
import {
  bandwidthResponseSchema,
  concentrationQuerySchema,
  concentrationResponseSchema,
  correlationQuerySchema,
  correlationResponseSchema,
  errorResponseSchema,
  exitsResponseSchema,
  familiesQuerySchema,
  familiesResponseSchema,
  familyDetailSchema,
  hhiRoleEnum,
  hhiTrendResponseSchema,
  hiddenFamiliesResponseSchema,
  ipv6ResponseSchema,
  networkHistoryResponseSchema,
  overloadResponseSchema,
  relayDetailSchema,
  relaysQuerySchema,
  relaysResponseSchema,
  statsResponseSchema,
  versionsResponseSchema,
} from './api';

/**
 * Build the OpenAPI 3.1 document for the Tor-Sockets public REST API (v1).
 * Consumed by `/api/v1/openapi.json` and rendered at `/api/docs`.
 *
 * Schemas + descriptions live with the zod definitions in `./api.ts`; this
 * file only wires them to paths and metadata. Adding a new endpoint = add a
 * `registerPath` call here + the matching schema in `./api.ts`.
 */
export function buildOpenApiDocument(serverUrl?: string): OpenAPIObject {
  const registry = new OpenAPIRegistry();

  // Shared schema registration (referenced by $ref from paths).
  registry.register('RelaysResponse', relaysResponseSchema);
  registry.register('RelayDetail', relayDetailSchema);
  registry.register('ConcentrationResponse', concentrationResponseSchema);
  registry.register('FamiliesResponse', familiesResponseSchema);
  registry.register('FamilyDetail', familyDetailSchema);
  registry.register('HiddenFamiliesResponse', hiddenFamiliesResponseSchema);
  registry.register('CorrelationResponse', correlationResponseSchema);
  registry.register('VersionsResponse', versionsResponseSchema);
  registry.register('OverloadResponse', overloadResponseSchema);
  registry.register('Ipv6Response', ipv6ResponseSchema);
  registry.register('BandwidthResponse', bandwidthResponseSchema);
  registry.register('HhiTrendResponse', hhiTrendResponseSchema);
  registry.register('NetworkHistoryResponse', networkHistoryResponseSchema);
  registry.register('ExitsResponse', exitsResponseSchema);
  registry.register('StatsResponse', statsResponseSchema);
  registry.register('ErrorResponse', errorResponseSchema);

  const json = (schema: ZodTypeAny) => ({
    'application/json': { schema },
  });

  // GET /relays
  registry.registerPath({
    method: 'get',
    path: '/relays',
    tags: ['relays'],
    summary: 'List relays with filters and pagination',
    request: { query: relaysQuerySchema },
    responses: {
      200: {
        description: 'Paginated list of relay summaries',
        content: json(relaysResponseSchema),
      },
      400: { description: 'Invalid query parameters', content: json(errorResponseSchema) },
    },
  });

  // GET /relays/{fingerprint}
  registry.registerPath({
    method: 'get',
    path: '/relays/{fingerprint}',
    tags: ['relays'],
    summary: 'Get full detail for a single relay by fingerprint',
    request: {
      params: z.object({
        fingerprint: z
          .string()
          .regex(/^[0-9A-F]{40}$/)
          .openapi({ description: '40-char hex fingerprint' }),
      }),
    },
    responses: {
      200: { description: 'Relay detail', content: json(relayDetailSchema) },
      404: { description: 'Relay not found', content: json(errorResponseSchema) },
    },
  });

  // GET /concentration
  registry.registerPath({
    method: 'get',
    path: '/concentration',
    tags: ['concentration'],
    summary: 'Latest HHI snapshot for a dimension, with top-N keys by consensus weight',
    description:
      'Herfindahl-Hirschman Index (0..10000). An index of 10000/N is the concentration of N equal-sized operators, so <1000 is 10 or more, 1000-2000 is five to ten, and >2000 is fewer than five. Append &format=csv for a CSV download.',
    request: { query: concentrationQuerySchema },
    responses: {
      200: { description: 'Concentration snapshot', content: json(concentrationResponseSchema) },
    },
  });

  // GET /families
  registry.registerPath({
    method: 'get',
    path: '/families',
    tags: ['families'],
    summary: 'List operator families (effective_family components, size ≥ 2)',
    description:
      'Operator families cut across AS and country - the real unit of "who controls the weight". Ranked by consensus weight, from the latest snapshot.',
    request: { query: familiesQuerySchema },
    responses: {
      200: { description: 'Paginated family directory', content: json(familiesResponseSchema) },
      404: { description: 'No family snapshots yet', content: json(errorResponseSchema) },
    },
  });

  // GET /families/{key}
  registry.registerPath({
    method: 'get',
    path: '/families/{key}',
    tags: ['families'],
    summary: 'Get one operator family, with members and AS/country spread',
    request: {
      params: z.object({
        key: z
          .string()
          .regex(/^[0-9A-F]{40}$/)
          .openapi({ description: 'Canonical family id: smallest member fingerprint (40 hex)' }),
      }),
    },
    responses: {
      200: { description: 'Family detail', content: json(familyDetailSchema) },
      404: { description: 'Family not found', content: json(errorResponseSchema) },
    },
  });

  // GET /correlation
  registry.registerPath({
    method: 'get',
    path: '/correlation',
    tags: ['concentration'],
    summary: 'Guard↔exit correlation risk - same entity on both ends of a circuit',
    description:
      'The Tor threat model: an AS/hoster/country on BOTH the guard and the exit of a circuit can correlate traffic and deanonymize the user. total_risk = Σ guard_share×exit_share = P(a random circuit is exposed to a single such entity). Top entities ranked by that product. Append &format=csv for a CSV download.',
    request: { query: correlationQuerySchema },
    responses: {
      200: {
        description: 'Correlation risk + top entities',
        content: json(correlationResponseSchema),
      },
    },
  });

  // GET /hidden-families
  registry.registerPath({
    method: 'get',
    path: '/hidden-families',
    tags: ['families'],
    summary: 'Hidden / undeclared operator families (same operator, not declared as family)',
    description:
      'Operators whose relays share a contact but are NOT a single declared effective_family - Tor path selection treats them as independent, so one hidden operator can sit on both ends of a circuit. Ranked by deanon_risk = guardShare × exitShare. Append &format=csv for a CSV download.',
    request: {},
    responses: {
      200: {
        description: 'Suspected hidden operator clusters',
        content: json(hiddenFamiliesResponseSchema),
      },
    },
  });

  // GET /versions
  registry.registerPath({
    method: 'get',
    path: '/versions',
    tags: ['versions'],
    summary: 'Version / EOL distribution across the running relay set',
    description:
      'Share of the network (relay count and consensus weight) on recommended vs obsolete Tor versions. Source: consensus version_status via Onionoo.',
    request: {},
    responses: {
      200: { description: 'Version distribution', content: json(versionsResponseSchema) },
    },
  });

  // GET /overload
  registry.registerPath({
    method: 'get',
    path: '/overload',
    tags: ['health'],
    summary: 'Overload signal - share of relays reporting general overload',
    description:
      'Relays that reported a general overload condition (Onionoo overload_general_timestamp), by relay count and consensus weight, plus the countries where overload concentrates.',
    request: {},
    responses: {
      200: { description: 'Overload distribution', content: json(overloadResponseSchema) },
    },
  });

  // GET /ipv6
  registry.registerPath({
    method: 'get',
    path: '/ipv6',
    tags: ['health'],
    summary: 'IPv6 support - dual-stack ratio of the running network',
    description:
      'Share of running relays reachable over IPv6 (an OR address in [brackets]), overall and split by guard/exit role, plus per-country adoption.',
    request: {},
    responses: {
      200: { description: 'IPv6 adoption', content: json(ipv6ResponseSchema) },
    },
  });

  // GET /bandwidth
  registry.registerPath({
    method: 'get',
    path: '/bandwidth',
    tags: ['health'],
    summary: 'Bandwidth measurement coverage (measured vs advertised)',
    description:
      'Share of the network measured by the bandwidth authorities vs relying on self-advertised bandwidth, plus the largest unmeasured relays by consensus weight.',
    request: {},
    responses: {
      200: {
        description: 'Bandwidth measurement coverage',
        content: json(bandwidthResponseSchema),
      },
    },
  });

  // GET /exits
  registry.registerPath({
    method: 'get',
    path: '/exits',
    tags: ['health'],
    summary: 'Exit scarcity - exits allowing key ports (80/443)',
    description:
      'Number and consensus weight of exit relays, and how many permit the scarce key ports 80/443. Source: exit_policy_summary via Onionoo.',
    request: {},
    responses: {
      200: { description: 'Exit capacity', content: json(exitsResponseSchema) },
    },
  });

  // GET /trends
  registry.registerPath({
    method: 'get',
    path: '/trends',
    tags: ['concentration'],
    summary: 'HHI trend - multi-day concentration slope per dimension',
    description:
      'Herfindahl-Hirschman Index over the last N days per dimension (country/AS/hoster/family) with per-day slope and direction, for a path-selection role. `role=exit` answers "is the exit network centralizing?". Complements the hour-over-hour hhi_jump anomaly.',
    request: {
      query: z.object({
        role: hhiRoleEnum
          .optional()
          .openapi({ description: 'Path-selection role (default consensus)' }),
      }),
    },
    responses: {
      200: { description: 'HHI time series + slope', content: json(hhiTrendResponseSchema) },
    },
  });

  // GET /network-history
  registry.registerPath({
    method: 'get',
    path: '/network-history',
    tags: ['health'],
    summary: 'Network history - relay/weight/bandwidth time series from relay_history',
    description:
      'Hourly time series of running relay count, total consensus weight, and total advertised bandwidth over the last N days, aggregated from the relay_history hypertable. Advertised bandwidth is each relay’s declared capacity, not measured throughput (Tor does not expose real throughput per relay).',
    request: {
      query: z.object({
        days: z.coerce
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .openapi({ description: 'Window in days (default 14)' }),
      }),
    },
    responses: {
      200: { description: 'Network time series', content: json(networkHistoryResponseSchema) },
    },
  });

  // GET /stats
  registry.registerPath({
    method: 'get',
    path: '/stats',
    tags: ['stats'],
    summary: 'Aggregate network statistics (latest consensus)',
    request: {},
    responses: {
      200: { description: 'Network stats', content: json(statsResponseSchema) },
    },
  });

  const config = {
    openapi: '3.1.0' as const,
    info: {
      title: 'Tor-Sockets API',
      version: '0.1.0',
      description:
        'Federated Tor network health & concentration monitor. All timestamps are UTC ISO 8601. Data sourced from [Onionoo](https://metrics.torproject.org/onionoo.html) (CC0).',
      license: { name: 'TBD (MIT for code, CC0 for derived Tor data)' },
    },
    servers: [{ url: serverUrl ?? '/api/v1', description: 'Tor-Sockets v1' }],
    tags: [
      { name: 'relays', description: 'Relay directory and search' },
      { name: 'concentration', description: 'Network concentration metrics (HHI)' },
      { name: 'families', description: 'Operator families (effective_family concentration)' },
      { name: 'versions', description: 'Tor version / EOL distribution' },
      { name: 'health', description: 'Network health signals (overload, IPv6, bandwidth, exits)' },
      { name: 'stats', description: 'Aggregate network statistics' },
    ],
  };

  return new OpenApiGeneratorV3(registry.definitions).generateDocument(config);
}
