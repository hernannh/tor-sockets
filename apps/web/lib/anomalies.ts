import { Activity, type LucideIcon, Network, TrendingUp, Zap } from 'lucide-react';

/**
 * Shared anomaly presentation - used by the dashboard AnomalyWidget and the
 * /alerts page so the two views stay consistent (label, icon, detail lines,
 * severity styling). One source of truth for the anomaly DSL.
 */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** Tailwind tokens for each severity:
 *  - `bar`: left accent rule (feed rows)
 *  - `text`: icon / number colour
 *  - `chip`: tint + border for the stats-strip count card
 *  - `solid`: dot fill */
export const SEV: Record<Severity, { bar: string; text: string; chip: string; solid: string }> = {
  info: {
    bar: 'before:bg-sev-info',
    text: 'text-sev-info',
    chip: 'bg-sev-info/10 border-sev-info/25',
    solid: 'bg-sev-info',
  },
  low: {
    bar: 'before:bg-sev-low',
    text: 'text-sev-low',
    chip: 'bg-sev-low/10 border-sev-low/25',
    solid: 'bg-sev-low',
  },
  medium: {
    bar: 'before:bg-sev-medium',
    text: 'text-sev-medium',
    chip: 'bg-sev-medium/10 border-sev-medium/25',
    solid: 'bg-sev-medium',
  },
  high: {
    bar: 'before:bg-sev-high',
    text: 'text-sev-high',
    chip: 'bg-sev-high/10 border-sev-high/25',
    solid: 'bg-sev-high',
  },
  critical: {
    bar: 'before:bg-sev-critical',
    text: 'text-sev-critical',
    chip: 'bg-sev-critical/10 border-sev-critical/25',
    solid: 'bg-sev-critical',
  },
};

export function sevOf(s: string): Severity {
  return (SEVERITY_RANK[s as Severity] !== undefined ? s : 'info') as Severity;
}

export const ANOMALY_TYPE_META: Record<string, { label: string; icon: LucideIcon }> = {
  hhi_jump: { label: 'HHI jump', icon: TrendingUp },
  as_cluster_new_relays: { label: 'Relay cluster', icon: Network },
  rapid_weight_gain: { label: 'Rapid weight gain', icon: Zap },
};

export function anomalyMeta(type: string): { label: string; icon: LucideIcon } {
  return ANOMALY_TYPE_META[type] ?? { label: type.replace(/_/g, ' '), icon: Activity };
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

/**
 * Human-readable detail for an anomaly row, derived from its `details` blob.
 * `primary` is the headline metric; `secondary` adds context; `href` links to a
 * relay detail when the anomaly is about a specific fingerprint.
 */
export function anomalyDetail(
  type: string,
  d: Record<string, unknown>,
): { primary: string; secondary?: string; href?: string } {
  switch (type) {
    case 'hhi_jump':
      return {
        primary: `${fmt(d.dimension)} · Δ ${fmt(d.delta)}`,
        secondary: `now ${fmt(d.current_hhi)} (was ${fmt(d.previous_hhi)})`,
      };
    case 'as_cluster_new_relays':
      return {
        primary: `${fmt(d.new_relays)} new relays`,
        secondary: `${fmt(d.as_name) !== '-' ? fmt(d.as_name) : fmt(d.as_number)} · 24h window`,
      };
    case 'rapid_weight_gain': {
      const window = d.window_hours !== undefined ? ` · ${fmt(d.window_hours)}h median` : '';
      return {
        primary: `weight ×${fmt(d.ratio)}`,
        secondary: `${fmt(d.baseline_weight)} → ${fmt(d.current_weight)}${window}`,
        href: typeof d.fingerprint === 'string' ? `/relays/${d.fingerprint}` : undefined,
      };
    }
    default:
      return { primary: type.replace(/_/g, ' ') };
  }
}
