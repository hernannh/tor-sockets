import {
  type InstanceKeypair,
  canonicalJson,
  safeFetch,
  sign,
  toBase64,
} from '@tor-sockets/federation';
import type { DeliveryResult, NotificationPayload } from './types';

/**
 * Deliver an alert to a webhook via signed POST.
 *
 * The body is the canonical-JSON notification; the signature covers
 * `${triggeredAt}.${instanceId}.${payloadHash}` and is sent in the
 * `X-TorSockets-Sig` header so receivers can verify against the sender's
 * actor-document pubkey (same scheme as the federation CDC log).
 *
 * `instance` is optional so the channel degrades to an unsigned POST when run
 * outside the worker (e.g. in a smoke test).
 */
export async function deliverWebhook(
  url: string,
  payload: NotificationPayload,
  instance?: InstanceKeypair,
): Promise<DeliveryResult> {
  const body = canonicalJson(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'tor-sockets-alerts/1.0',
  };

  if (instance) {
    const payloadHash = await sha256Hex(body);
    const message = `${payload.triggeredAt}.${instance.instanceId}.${payloadHash}`;
    const sig = toBase64(sign(Buffer.from(message, 'utf8'), instance.privateKey));
    headers['x-tor-sockets-sig'] = sig;
    headers['x-tor-sockets-instance'] = instance.instanceId;
  }

  try {
    const res = await safeFetch(url, {
      method: 'POST',
      body,
      headers,
      timeoutMs: WEBHOOK_TIMEOUT_MS,
      maxBytes: 64_000, // a webhook ack has no business being large
    });
    if (!res.ok) {
      return { channel: `webhook:${url}`, ok: false, error: `HTTP ${res.status}` };
    }
    return { channel: `webhook:${url}`, ok: true };
  } catch (err) {
    return {
      channel: `webhook:${url}`,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Per-request deadline. This used to be a module-scope `AbortSignal.timeout()`,
// which starts counting at import: 15s after the worker booted the signal was
// already aborted and EVERY webhook delivery failed instantly.
const WEBHOOK_TIMEOUT_MS = 15_000;

async function sha256Hex(data: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(data, 'utf8').digest('hex');
}
