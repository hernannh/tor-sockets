import { deliver } from './notify';
import { buildAlertView } from './notify/format';
import type { NotificationPayload } from './notify/types';

/**
 * One-shot smoke test for the ALERT MESSAGE FORMAT.
 *
 * `smoke-alerts.ts` exercises the rule engine; this one exercises what the
 * operator actually reads. It delivers two payloads - one threshold rule (whose
 * `threshold` field is an object) and one anomaly (whose detector details are
 * nested) - to the channels configured in env, so the rendering can be checked
 * in a real Telegram client and a real mail client instead of a unit test.
 *
 * It writes nothing to the database and fires no rules.
 *
 * Usage: `bun run src/smoke-notify.ts`
 * Env:   ALERT_EMAIL and/or ALERT_TELEGRAM_CHAT, plus that channel's config.
 */

const now = new Date().toISOString();

const PAYLOADS: NotificationPayload[] = [
  {
    ruleId: 'smoke-share',
    ruleName: '[format test] Country exit share > 25%',
    severity: 'medium',
    title: 'exit share country=nl > 25%: now 33.48%',
    condition: { type: 'concentration_share', dimension: 'country', op: '>', value: 25 },
    details: {
      dimension: 'country',
      key: 'nl',
      role: 'exit',
      share: 33.48,
      relay_count: 1161,
      threshold: { op: '>', value: 25 },
      snapshot_time: now,
    },
    triggeredAt: now,
  },
  {
    ruleId: 'smoke-anomaly',
    ruleName: '[format test] Notable anomaly detected',
    severity: 'medium',
    title: '17255729 weight ×6.82',
    condition: { type: 'anomaly', severityMin: 'medium' },
    details: {
      anomaly_id: 'smoke-0000',
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
      detected_at: now,
      source_instance: 'smoke',
    },
    triggeredAt: now,
  },
];

async function main() {
  const channels: string[] = [];
  if (process.env.ALERT_EMAIL) channels.push(`email:${process.env.ALERT_EMAIL}`);
  if (process.env.ALERT_TELEGRAM_CHAT) channels.push(`telegram:${process.env.ALERT_TELEGRAM_CHAT}`);
  if (channels.length === 0) {
    console.error('[smoke] no ALERT_EMAIL / ALERT_TELEGRAM_CHAT in env - nothing to deliver');
    process.exit(1);
  }
  console.log('[smoke] channels:', channels.map((c) => c.split(':')[0]).join(', '));

  for (const payload of PAYLOADS) {
    const view = buildAlertView(payload);
    console.log(`\n[smoke] ${view.severityLabel} ${view.ruleName}`);
    for (const f of view.fields) console.log(`  ${f.label}: ${f.value}`);
    const results = await deliver(channels, payload);
    for (const r of results) {
      console.log(`  → ${r.channel.split(':')[0]}: ${r.ok ? 'ok' : `FAILED ${r.error}`}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});
