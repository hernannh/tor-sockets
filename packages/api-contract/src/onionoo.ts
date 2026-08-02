import { z } from 'zod';

/**
 * Zod schemas for the Onionoo REST API.
 * Spec: https://metrics.torproject.org/onionoo.html
 *
 * Per the Onionoo rules, clients MUST ignore unknown fields - `.passthrough()`
 * keeps them so downstream code does not break on minor protocol bumps.
 */

const timestamp = z.string();

export const onionooFlag = z.enum([
  'Authority',
  'BadExit',
  'Exit',
  'Fast',
  'Guard',
  'HSDir',
  'MiddleOnly',
  'NoEdConsensus',
  'Running',
  'Stable',
  'StaleDesc',
  'Sybil',
  'Valid',
  'V2Dir',
]);

export const onionooRelaySchema = z
  .object({
    fingerprint: z.string().regex(/^[0-9A-F]{40}$/),
    hashed_fingerprint: z.string().optional(),
    nickname: z.string().min(1).max(19),
    first_seen: timestamp,
    last_seen: timestamp,
    last_restarted: timestamp.optional(),
    last_changed_address_or_port: timestamp.optional(),
    running: z.boolean(),
    hibernating: z.boolean().optional(),
    flags: z.array(z.string()).optional().default([]),
    or_addresses: z.array(z.string()).default([]),
    exit_addresses: z.array(z.string()).optional().default([]),
    dir_address: z.string().optional(),
    country: z.string().optional(),
    country_name: z.string().optional(),
    region_name: z.string().optional(),
    city_name: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    as: z.string().optional(),
    as_name: z.string().optional(),
    consensus_weight: z.number().int().nonnegative(),
    consensus_weight_fraction: z.number().min(0).max(1).optional(),
    guard_probability: z.number().min(0).max(1).optional(),
    middle_probability: z.number().min(0).max(1).optional(),
    exit_probability: z.number().min(0).max(1).optional(),
    measured: z.boolean().optional(),
    advertised_bandwidth: z.number().int().nonnegative().optional(),
    bandwidth_rate: z.number().int().nonnegative().optional(),
    bandwidth_burst: z.number().int().nonnegative().optional(),
    observed_bandwidth: z.number().int().nonnegative().optional(),
    overload_general_timestamp: z.number().int().nonnegative().optional(),
    contact: z.string().optional(),
    platform: z.string().optional(),
    version: z.string().optional(),
    recommended_version: z.boolean().optional(),
    version_status: z.string().optional(),
    exit_policy_summary: z
      .object({
        accept: z.array(z.string()).optional(),
        reject: z.array(z.string()).optional(),
      })
      .optional(),
    effective_family: z.array(z.string()).optional().default([]),
    alleged_family: z.array(z.string()).optional().default([]),
    indirect_family: z.array(z.string()).optional().default([]),
    verified_host_names: z.array(z.string()).optional().default([]),
    unverified_host_names: z.array(z.string()).optional().default([]),
    unreachable_or_addresses: z.array(z.string()).optional().default([]),
  })
  .passthrough();

export type OnionooRelay = z.infer<typeof onionooRelaySchema>;

export const onionooDetailsResponseSchema = z
  .object({
    version: z.string(),
    next_major_version_scheduled: z.string().optional(),
    relays_published: timestamp,
    relays: z.array(onionooRelaySchema),
    relays_truncated: z.number().int().nonnegative().optional(),
    relays_skipped: z.number().int().nonnegative().optional(),
    bridges_published: timestamp,
    bridges: z.array(z.unknown()).default([]),
  })
  .passthrough();

export type OnionooDetailsResponse = z.infer<typeof onionooDetailsResponseSchema>;
