import { describe, expect, test } from 'bun:test';
import { renderHtml, renderText } from './email';
import { buildAlertView, formatValue } from './format';
import { renderMessage } from './telegram';
import type { NotificationPayload } from './types';

const BASE = 'https://monitor.example.org';

/** The exact shape `evalConcentrationShare` emits (threshold is an object). */
const sharePayload: NotificationPayload = {
  ruleId: 'r1',
  ruleName: 'Country exit share > 25%',
  severity: 'medium',
  title: 'exit share country=nl > 25%: now 33.48%',
  condition: { type: 'concentration_share' },
  details: {
    dimension: 'country',
    key: 'nl',
    role: 'exit',
    share: 33.48,
    relay_count: 1161,
    threshold: { op: '>', value: 25 },
    snapshot_time: '2026-07-25T20:21:24.423Z',
  },
  triggeredAt: '2026-07-25T20:21:35.940Z',
};

/** The anomaly shape: the detector's own details are nested one level down. */
const anomalyPayload: NotificationPayload = {
  ruleId: 'r2',
  ruleName: 'Notable anomaly detected',
  severity: 'medium',
  title: '17255729 weight ×6.82',
  condition: { type: 'anomaly' },
  details: {
    anomaly_id: '4895ea88d2068197a4d3f1f8fa56ba48a352',
    anomaly_type: 'rapid_weight_gain',
    severity: 'medium',
    details: {
      ratio: 6.82,
      country: 'ro',
      samples: 11,
      as_number: 'AS47890',
      fingerprint: '1725572936427B431C44F3AFE8EB5CD0769BC850',
      current_time: '21:20:39.932273+00',
      window_hours: 12,
      current_weight: 15000,
      baseline_weight: 2200,
    },
    detected_at: '2026-07-25T21:20:40.015Z',
    source_instance: 'fa98b47fa89f18da11d071b424dba8b1e304450dfc1482622163d9c9a58e2be7',
  },
  triggeredAt: '2026-07-25T21:20:40.047Z',
};

describe('formatValue', () => {
  test('renders a threshold object as the comparison, not [object Object]', () => {
    expect(formatValue('threshold', { op: '>', value: 25 })).toBe('> 25');
  });

  test('formats shares, ratios, windows and deltas with their unit', () => {
    expect(formatValue('share', 33.48)).toBe('33.48%');
    expect(formatValue('ratio', 6.82)).toBe('×6.82');
    expect(formatValue('window_hours', 12)).toBe('12h');
    expect(formatValue('delta', 500)).toBe('+500');
  });

  test('groups thousands and keeps identifiers verbatim', () => {
    expect(formatValue('current_weight', 15000)).toBe('15,000');
    expect(formatValue('as_number', 'AS47890')).toBe('AS47890');
  });

  test('normalises timestamps and Postgres time-of-day values', () => {
    expect(formatValue('detected_at', '2026-07-25T21:20:40.015Z')).toBe('2026-07-25 21:20 UTC');
    expect(formatValue('current_time', '21:20:39.932273+00')).toBe('21:20:39 UTC');
  });

  test('has a placeholder for empty values', () => {
    expect(formatValue('key', null)).toBe('-');
    expect(formatValue('key', [])).toBe('-');
  });
});

describe('buildAlertView', () => {
  test('hoists the nested detector details and drops machine-only keys', () => {
    const view = buildAlertView(anomalyPayload, BASE);
    const labels = view.fields.map((f) => f.label);
    expect(labels).toContain('Weight gain');
    expect(labels).toContain('Baseline weight');
    expect(labels).not.toContain('Details');
    expect(labels).not.toContain('Anomaly id');
    expect(labels).not.toContain('Source instance');
  });

  test('orders the fields by relevance, not by insertion', () => {
    const view = buildAlertView(sharePayload, BASE);
    expect(view.fields.map((f) => f.label).slice(0, 4)).toEqual([
      'Dimension',
      'Key',
      'Role',
      'Share',
    ]);
  });

  test('links the relay detail page when the payload carries a fingerprint', () => {
    const view = buildAlertView(anomalyPayload, BASE);
    expect(view.links[0]).toEqual({
      label: 'Relay detail',
      url: `${BASE}/relays/1725572936427B431C44F3AFE8EB5CD0769BC850`,
    });
    expect(view.links.at(-1)?.url).toBe(`${BASE}/alerts`);
  });

  test('emits no links when no public base URL is configured', () => {
    // Passing `undefined` explicitly still falls back to the default argument,
    // so the env var is what has to be empty for this path.
    const previous = process.env.TOR_SOCKETS_BASE_URL;
    process.env.TOR_SOCKETS_BASE_URL = '';
    try {
      expect(buildAlertView(sharePayload).links).toEqual([]);
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, 'TOR_SOCKETS_BASE_URL');
      else process.env.TOR_SOCKETS_BASE_URL = previous;
    }
  });
});

describe('channel rendering', () => {
  test('telegram never prints [object Object]', () => {
    const msg = renderMessage(sharePayload);
    expect(msg).not.toContain('[object Object]');
    expect(msg).toContain('<b>Threshold:</b> <code>&gt; 25</code>');
    expect(msg).toContain('MEDIUM');
  });

  test('email text is a label block, not JSON', () => {
    const text = renderText(buildAlertView(anomalyPayload, BASE));
    expect(text).not.toContain('{');
    expect(text).toContain('Weight gain');
    expect(text).toContain('×6.82');
    expect(text).toContain(`${BASE}/alerts`);
  });

  test('email html escapes values and carries no remote assets', () => {
    const html = renderHtml(buildAlertView(sharePayload, BASE));
    expect(html).toContain('<table');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('[object Object]');
    const hostile = buildAlertView({ ...sharePayload, title: '<script>alert(1)</script>' }, BASE);
    expect(renderHtml(hostile)).toContain('&lt;script&gt;');
  });
});
