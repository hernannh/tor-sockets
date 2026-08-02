import type { NotificationPayload } from './types';

/**
 * Presentation layer shared by the email and Telegram channels.
 *
 * Alert payloads are raw JSON shaped for machines: `evalAnomaly` nests the
 * detector's own `details` object one level down, and the threshold rules carry
 * `threshold: { op, value }`. Rendering that with `String(v)` printed
 * `[object Object]` in Telegram, and dumping it with `JSON.stringify` made the
 * email unreadable. `buildAlertView` turns a payload into ordered, labelled,
 * human-formatted fields; each channel only decides how to lay them out.
 *
 * The webhook channel is deliberately NOT a consumer: it delivers the raw
 * signed payload, because its receiver is a program.
 */

export interface AlertField {
  label: string;
  value: string;
}

export interface AlertLink {
  label: string;
  url: string;
}

export interface AlertView {
  severityLabel: string;
  severity: string;
  ruleName: string;
  title: string;
  triggeredAt: string;
  fields: AlertField[];
  links: AlertLink[];
}

/** Keys that carry no meaning for a human reader, or that are shown elsewhere. */
const HIDDEN_KEYS = new Set(['anomaly_id', 'source_instance', 'severity', 'source_id']);

/** Field order - anything not listed keeps its original (insertion) order after these. */
const FIELD_ORDER = [
  'anomaly_type',
  'dimension',
  'key',
  'role',
  'share',
  'relay_count',
  'hhi',
  'current_hhi',
  'delta',
  'threshold',
  'ratio',
  'current_weight',
  'baseline_weight',
  'samples',
  'window_hours',
  'new_relays',
  'fingerprint',
  'nickname',
  'as_number',
  'as_name',
  'country',
  'snapshot_time',
  'current_time',
  'detected_at',
];

const LABELS: Record<string, string> = {
  anomaly_type: 'Type',
  as_name: 'AS name',
  as_number: 'AS',
  baseline_weight: 'Baseline weight',
  current_hhi: 'Current HHI',
  current_time: 'Measured at',
  current_weight: 'Current weight',
  delta: 'Change',
  detected_at: 'Detected at',
  hhi: 'HHI',
  key: 'Key',
  new_relays: 'New relays',
  ratio: 'Weight gain',
  relay_count: 'Relays',
  samples: 'Samples',
  share: 'Share',
  snapshot_time: 'Snapshot',
  threshold: 'Threshold',
  window_hours: 'Window',
};

export function buildAlertView(
  p: NotificationPayload,
  baseUrl: string | undefined = process.env.TOR_SOCKETS_BASE_URL,
): AlertView {
  const entries = flattenDetails(p.details).filter(([k]) => !HIDDEN_KEYS.has(k));
  const fields = sortFields(entries).map(([k, v]) => ({
    label: labelFor(k),
    value: formatValue(k, v),
  }));

  return {
    severityLabel: severityLabel(p.severity),
    severity: p.severity,
    ruleName: p.ruleName,
    title: p.title,
    triggeredAt: formatTimestamp(p.triggeredAt),
    fields,
    links: buildLinks(entries, baseUrl),
  };
}

/**
 * Hoist the detector's nested `details` object into the top level. Anomaly
 * payloads are `{ anomaly_type, details: { ratio, country, ... }, ... }`; the
 * reader wants one flat list, not a nested blob.
 */
function flattenDetails(details: Record<string, unknown>): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(details ?? {})) {
    if (k === 'details' && isPlainObject(v)) {
      out.push(...Object.entries(v));
      continue;
    }
    out.push([k, v]);
  }
  return out;
}

function sortFields(entries: Array<[string, unknown]>): Array<[string, unknown]> {
  const rank = (k: string) => {
    const i = FIELD_ORDER.indexOf(k);
    return i === -1 ? FIELD_ORDER.length : i;
  };
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e[0]) - rank(b.e[0]) || a.i - b.i)
    .map(({ e }) => e);
}

function labelFor(key: string): string {
  const known = LABELS[key];
  if (known) return known;
  const words = key.split('_');
  const head = words[0] ?? key;
  return [head.charAt(0).toUpperCase() + head.slice(1), ...words.slice(1)].join(' ');
}

export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) {
    return value.length === 0 ? '-' : value.map((v) => formatValue(key, v)).join(', ');
  }
  if (isPlainObject(value)) return formatObject(value);

  if (typeof value === 'number') return formatNumber(key, value);
  const s = String(value);

  // `rapid_weight_gain` reads as a database enum; the reader wants a sentence.
  if (key === 'anomaly_type')
    return labelFor(s)
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase());
  if (key === 'country' && /^[a-z]{2}$/i.test(s)) return s.toUpperCase();

  // Numeric strings still deserve the numeric treatment (jsonb round-trips
  // some of these as strings).
  if (/^-?\d+(\.\d+)?$/.test(s) && key !== 'as_number' && key !== 'fingerprint') {
    return formatNumber(key, Number(s));
  }
  if (isTimestamp(s)) return formatTimestamp(s);
  if (isTimeOfDay(s)) return `${s.slice(0, 8)} UTC`;
  return s;
}

/**
 * `threshold: { op: '>', value: 25 }` is the shape that printed
 * `[object Object]`. Render the comparison the operator actually configured;
 * fall back to `k=v` pairs for any other object.
 */
function formatObject(value: Record<string, unknown>): string {
  if ('op' in value && 'value' in value) {
    return `${String(value.op)} ${formatValue('value', value.value)}`;
  }
  const pairs = Object.entries(value).map(
    ([k, v]) => `${labelFor(k).toLowerCase()} ${formatValue(k, v)}`,
  );
  return pairs.length > 0 ? pairs.join(', ') : '-';
}

function formatNumber(key: string, n: number): string {
  if (key === 'ratio') return `×${round(n, 2)}`;
  if (key === 'share' || key.endsWith('_pct') || key.endsWith('_percent')) {
    return `${round(n, 2)}%`;
  }
  if (key === 'window_hours') return `${round(n, 0)}h`;
  if (key === 'delta') return `${n > 0 ? '+' : ''}${round(n, 2)}`;
  return Number.isInteger(n) ? n.toLocaleString('en-US') : round(n, 2).toLocaleString('en-US');
}

function round(n: number, digits: number): number {
  return Number(n.toFixed(digits));
}

function isTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s);
}

/** Postgres `time with time zone` round-trips as `21:20:39.932273+00`. */
function isTimeOfDay(s: string): boolean {
  return /^\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?)?$/.test(s);
}

/** `2026-07-25T21:20:40.047Z` → `2026-07-25 21:20 UTC`. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function buildLinks(entries: Array<[string, unknown]>, baseUrl?: string): AlertLink[] {
  const base = baseUrl?.replace(/\/$/, '');
  if (!base) return [];
  const links: AlertLink[] = [];
  const fingerprint = entries.find(([k]) => k === 'fingerprint')?.[1];
  if (typeof fingerprint === 'string' && /^[A-Fa-f0-9]{40}$/.test(fingerprint)) {
    links.push({ label: 'Relay detail', url: `${base}/relays/${fingerprint.toUpperCase()}` });
  }
  links.push({ label: 'Alerts & anomalies', url: `${base}/alerts` });
  return links;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The scannable severity marker that opens every rendered alert.
 *
 * Plain text rather than a coloured symbol: it reads identically in a
 * plain-text mail client, a terminal, a log line and a notification preview,
 * it is greppable, and a screen reader says the word instead of describing a
 * circle. The HTML mail body still carries colour, as an accent bar keyed to
 * the same severity.
 */
export function severityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return '[CRITICAL]';
    case 'high':
      return '[HIGH]';
    case 'medium':
      return '[MEDIUM]';
    case 'low':
      return '[LOW]';
    default:
      return '[INFO]';
  }
}
