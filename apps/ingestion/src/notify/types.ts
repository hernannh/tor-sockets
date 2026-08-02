import type { Severity } from '@tor-sockets/analysis';

/**
 * Notification delivery (Fase 3.1).
 *
 * Channels are encoded as `<kind>:<target>` strings on each alert rule:
 *   webhook:https://example.com/hook   → signed POST (Ed25519)
 *   email:operator@example.com          → SMTP via nodemailer
 *   telegram:123456789                  → Telegram Bot API
 *
 * Each channel is best-effort: a failure in one channel never blocks the
 * others or the alert materialization. Missing configuration (no SMTP host,
 * no bot token) makes the channel a no-op logged at info level.
 */

export interface NotificationPayload {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  title: string;
  condition: unknown;
  details: Record<string, unknown>;
  triggeredAt: string;
}

export interface DeliveryResult {
  channel: string;
  ok: boolean;
  error?: string;
}

export type ChannelKind = 'webhook' | 'email' | 'telegram';

export function parseChannel(raw: string): { kind: ChannelKind; target: string } | null {
  const idx = raw.indexOf(':');
  if (idx <= 0) return null;
  const kind = raw.slice(0, idx) as ChannelKind;
  const target = raw.slice(idx + 1);
  if (kind !== 'webhook' && kind !== 'email' && kind !== 'telegram') return null;
  if (!target) return null;
  return { kind, target };
}
