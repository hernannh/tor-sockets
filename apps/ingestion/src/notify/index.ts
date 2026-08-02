import type { InstanceKeypair } from '@tor-sockets/federation';
import { deliverEmail } from './email';
import { deliverTelegram } from './telegram';
import { type DeliveryResult, type NotificationPayload, parseChannel } from './types';
import { deliverWebhook } from './webhook';

/**
 * Deliver a notification to all channels of a rule.
 *
 * Each channel is independent and best-effort: a failure (or a missing
 * config no-op) in one channel never blocks the others. Returns one
 * DeliveryResult per channel so the caller can record what was delivered.
 */
export async function deliver(
  channels: string[],
  payload: NotificationPayload,
  instance?: InstanceKeypair,
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  for (const raw of channels) {
    const parsed = parseChannel(raw);
    if (!parsed) {
      results.push({ channel: raw, ok: false, error: 'malformed channel' });
      continue;
    }
    switch (parsed.kind) {
      case 'webhook':
        results.push(await deliverWebhook(parsed.target, payload, instance));
        break;
      case 'email':
        results.push(await deliverEmail(parsed.target, payload));
        break;
      case 'telegram':
        results.push(await deliverTelegram(parsed.target, payload));
        break;
    }
  }
  return results;
}

export * from './types';
