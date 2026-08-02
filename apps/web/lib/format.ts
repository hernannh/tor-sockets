import { type HhiBand, hhiBand } from '@tor-sockets/api-contract';
/**
 * Display formatting helpers for the dashboard. Pure, locale-aware.
 */

const NF = new Intl.NumberFormat('en-US');

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return NF.format(n);
}

/**
 * HHI display: it's a 0..10000 index stored as a double, so round to an integer
 * before grouping. Uses the fixed en-US formatter (never the browser locale) so
 * server and client render the same string - a raw `hhi.toLocaleString()` shows
 * the decimals and can flip separators, making ~1401 read as "1.400,635".
 */
export function formatHhi(hhi: number | null | undefined): string {
  if (hhi === null || hhi === undefined) return '-';
  return NF.format(Math.round(hhi));
}

export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    n,
  );
}

export function formatPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(digits)}%`;
}

export function formatBandwidth(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec === null || bytesPerSec === undefined) return '-';
  const mbps = (bytesPerSec * 8) / 1_000_000;
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbit/s`;
  return `${mbps.toFixed(1)} Mbit/s`;
}

/**
 * Compact bandwidth axis label (e.g. "142G", "1.4T") - the full "Gbit/s" string
 * from `formatBandwidth` overflows a narrow Y axis and gets clipped to "000".
 * The unit is implied by the chart title; the tooltip keeps the full form.
 */
export function formatBandwidthAxis(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec === null || bytesPerSec === undefined) return '-';
  const gbps = (bytesPerSec * 8) / 1_000_000_000;
  if (gbps >= 1000) return `${(gbps / 1000).toFixed(1)}T`;
  if (gbps >= 1) return `${gbps.toFixed(0)}G`;
  const mbps = (bytesPerSec * 8) / 1_000_000;
  return `${mbps.toFixed(0)}M`;
}

/**
 * Re-exported so components keep importing their formatting from one place. The
 * bands themselves live in `@tor-sockets/analysis` (see `hhi-bands.ts`): the
 * same policy used to be hardcoded in six files - this formatter, the gauge, the
 * dashboard tile, the alert severity and two OpenAPI descriptions - which is a
 * guarantee that they eventually disagree.
 */
export type HHISeverity = HhiBand;

export const hhiSeverity = hhiBand;

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_STYLE: Record<Severity, string> = {
  info: 'border-sev-info/30 bg-sev-info/10 text-sev-info',
  low: 'border-sev-low/30 bg-sev-low/10 text-sev-low',
  medium: 'border-sev-medium/30 bg-sev-medium/10 text-sev-medium',
  high: 'border-sev-high/30 bg-sev-high/10 text-sev-high',
  critical: 'border-sev-critical/30 bg-sev-critical/10 text-sev-critical',
};

export function severityStyle(s: string): string {
  return SEVERITY_STYLE[s as Severity] ?? SEVERITY_STYLE.info;
}

export function hhiLabel(hhi: number): string {
  const s = hhiSeverity(hhi);
  return s === 'low' ? 'low concentration' : s === 'moderate' ? 'moderate' : 'high concentration';
}

const RTF = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '-';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RTF.format(Math.round(diffSec), 'second');
  if (abs < 3600) return RTF.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return RTF.format(Math.round(diffSec / 3600), 'hour');
  return RTF.format(Math.round(diffSec / 86400), 'day');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}
