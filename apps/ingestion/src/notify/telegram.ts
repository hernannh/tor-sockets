import { buildAlertView } from './format';
import type { DeliveryResult, NotificationPayload } from './types';

/**
 * Deliver an alert via the Telegram Bot API.
 *
 * Requires `TELEGRAM_BOT_TOKEN` in env. Without it, the channel is a no-op
 * (returns ok:false with a clear reason) - alerts still materialize and other
 * channels still fire. `target` is the chat id (numeric).
 */

const API_BASE = 'https://api.telegram.org';
// Per-request deadline: a module-scope AbortSignal.timeout() starts counting at
// import, so every delivery after the first 15s of uptime would abort at once.
const TIMEOUT_MS = 15_000;

export async function deliverTelegram(
  chatId: string,
  payload: NotificationPayload,
): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { channel: `telegram:${chatId}`, ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  const text = renderMessage(payload);
  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { channel: `telegram:${chatId}`, ok: false, error: `HTTP ${res.status} ${detail}` };
    }
    return { channel: `telegram:${chatId}`, ok: true };
  } catch (err) {
    return {
      channel: `telegram:${chatId}`,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function renderMessage(p: NotificationPayload): string {
  const view = buildAlertView(p);
  const details = view.fields
    .slice(0, 12)
    .map((f) => `<b>${escapeHtml(f.label)}:</b> <code>${escapeHtml(f.value)}</code>`)
    .join('\n');
  const links = view.links
    .map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`)
    .join(' · ');

  return [
    `<b>${escapeHtml(view.severityLabel)}</b> ${escapeHtml(view.ruleName)}`,
    escapeHtml(view.title),
    '',
    details,
    '',
    links,
    `<i>${escapeHtml(view.triggeredAt)}</i>`,
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
