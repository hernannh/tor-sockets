import type { OnionooRelay } from '@tor-sockets/api-contract';
import type { NewRelay, NewRelayHistoryRow } from '@tor-sockets/db';
import { parseOnionooTimestamp } from './adapters/onionoo';

/**
 * Convert an Onionoo relay object to our `relays` row shape.
 * Bandwidth values become bigint; probabilities stay as float strings (numeric).
 * Family fingerprints are stripped of any stray `$` prefix (Onionoo ≥5.0
 * already does this, but we defend in depth).
 */
export function normalizeRelay(relay: OnionooRelay, sources: string[]): NewRelay {
  return {
    fingerprint: relay.fingerprint,
    nickname: relay.nickname,
    hashedFingerprint: relay.hashed_fingerprint,
    firstSeen: parseOnionooTimestamp(relay.first_seen),
    lastSeen: parseOnionooTimestamp(relay.last_seen),
    lastRestarted: relay.last_restarted ? parseOnionooTimestamp(relay.last_restarted) : null,
    running: relay.running,
    hibernating: relay.hibernating ?? null,
    flags: relay.flags ?? [],
    orAddresses: relay.or_addresses ?? [],
    exitAddresses: relay.exit_addresses ?? [],
    dirAddress: relay.dir_address ?? null,
    country: relay.country ?? null,
    countryName: relay.country_name ?? null,
    cityName: relay.city_name ?? null,
    latitude: relay.latitude != null ? String(relay.latitude) : null,
    longitude: relay.longitude != null ? String(relay.longitude) : null,
    asNumber: relay.as ?? null,
    asName: relay.as_name ?? null,
    consensusWeight: relay.consensus_weight,
    consensusWeightFraction:
      relay.consensus_weight_fraction != null ? String(relay.consensus_weight_fraction) : null,
    guardProbability: relay.guard_probability != null ? String(relay.guard_probability) : null,
    middleProbability: relay.middle_probability != null ? String(relay.middle_probability) : null,
    exitProbability: relay.exit_probability != null ? String(relay.exit_probability) : null,
    measured: relay.measured ?? null,
    advertisedBandwidth:
      relay.advertised_bandwidth != null ? BigInt(relay.advertised_bandwidth) : null,
    bandwidthRate: relay.bandwidth_rate != null ? BigInt(relay.bandwidth_rate) : null,
    bandwidthBurst: relay.bandwidth_burst != null ? BigInt(relay.bandwidth_burst) : null,
    observedBandwidth: relay.observed_bandwidth != null ? BigInt(relay.observed_bandwidth) : null,
    overloadGeneralTimestamp: relay.overload_general_timestamp
      ? new Date(relay.overload_general_timestamp)
      : null,
    contact: relay.contact ?? null,
    platform: relay.platform ?? null,
    version: relay.version ?? null,
    recommendedVersion: relay.recommended_version ?? null,
    versionStatus: relay.version_status ?? null,
    exitsPort443: exitAllowsPort(relay.exit_policy_summary, 443),
    exitsPort80: exitAllowsPort(relay.exit_policy_summary, 80),
    exitPolicySummary: relay.exit_policy_summary ?? null,
    effectiveFamily: stripFamilyDollars(relay.effective_family ?? []),
    allegedFamily: stripFamilyDollars(relay.alleged_family ?? []),
    indirectFamily: stripFamilyDollars(relay.indirect_family ?? []),
    verifiedHostNames: relay.verified_host_names ?? [],
    unreachableOrAddresses: relay.unreachable_or_addresses ?? [],
    sources,
  };
}

/**
 * Build a `relay_history` row for the current consensus cycle.
 * Probabilities are scaled to integer ppm (parts per million) for compactness.
 */
export function toHistoryRow(
  relay: OnionooRelay,
  consensusTime: Date,
  consensusFingerprint: string | null,
): NewRelayHistoryRow {
  return {
    time: consensusTime,
    fingerprint: relay.fingerprint,
    consensusWeight: relay.consensus_weight,
    running: relay.running,
    flags: relay.flags ?? [],
    guardProbability:
      relay.guard_probability != null ? Math.round(relay.guard_probability * 1_000_000) : null,
    middleProbability:
      relay.middle_probability != null ? Math.round(relay.middle_probability * 1_000_000) : null,
    exitProbability:
      relay.exit_probability != null ? Math.round(relay.exit_probability * 1_000_000) : null,
    advertisedBandwidth:
      relay.advertised_bandwidth != null ? BigInt(relay.advertised_bandwidth) : null,
    country: relay.country ?? null,
    asNumber: relay.as ?? null,
    consensusFingerprint,
  };
}

function stripFamilyDollars(fingerprints: string[]): string[] {
  return fingerprints.map((fp) => (fp.startsWith('$') ? fp.slice(1) : fp));
}

/**
 * Does a relay's exit policy permit `port`? Onionoo `exit_policy_summary` is
 * either `{accept: [...ranges]}` or `{reject: [...ranges]}` (mutually exclusive),
 * each range a `"N"` or `"N-M"` string. accept → port must match a range;
 * reject → port must NOT match any range. No summary / empty accept → not an
 * exit for this port. Returns null when there is no policy at all (non-exit).
 */
function exitAllowsPort(
  summary: { accept?: string[]; reject?: string[] } | undefined,
  port: number,
): boolean | null {
  if (!summary) return null;
  const inRanges = (ranges: string[] | undefined): boolean => {
    if (!ranges) return false;
    for (const r of ranges) {
      const [lo, hi] = r.split('-');
      const low = Number.parseInt(lo, 10);
      const high = hi != null ? Number.parseInt(hi, 10) : low;
      if (Number.isFinite(low) && port >= low && port <= high) return true;
    }
    return false;
  };
  if (summary.accept) return inRanges(summary.accept);
  if (summary.reject) return !inRanges(summary.reject);
  return null;
}
