import nodemailer, { type Transporter } from 'nodemailer';
import { type AlertView, buildAlertView } from './format';
import type { DeliveryResult, NotificationPayload } from './types';

/**
 * Deliver an alert via SMTP email (nodemailer).
 *
 * Config is read from env, lazily building a singleton transporter:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If `SMTP_HOST` or `SMTP_FROM` is unset, the channel is a no-op (returns
 * ok:false with a clear reason) - alerts still materialize and other channels
 * still fire. This lets the stack run locally without an SMTP server.
 */

let transporter: Transporter | null = null;
let configError: string | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) {
    configError = 'SMTP_HOST or SMTP_FROM not configured';
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
      : undefined,
  });
  return transporter;
}

export async function deliverEmail(
  to: string,
  payload: NotificationPayload,
): Promise<DeliveryResult> {
  const tx = getTransporter();
  if (!tx) {
    return { channel: `email:${to}`, ok: false, error: configError ?? 'no transporter' };
  }

  const view = buildAlertView(payload);
  const subject = `${view.severityLabel} ${payload.ruleName}: ${payload.title}`;

  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text: renderText(view),
      html: renderHtml(view),
    });
    return { channel: `email:${to}`, ok: true };
  } catch (err) {
    return {
      channel: `email:${to}`,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Plain-text body: an aligned label/value block, not a JSON dump. Labels are
 * padded to the longest one so the values line up in a monospace client.
 */
export function renderText(view: AlertView): string {
  const width = view.fields.reduce((w, f) => Math.max(w, f.label.length), 0);
  const lines = [
    `${view.severityLabel} ${view.ruleName}`,
    view.title,
    '',
    ...view.fields.map((f) => `  ${f.label.padEnd(width)}   ${f.value}`),
    '',
    `  ${'Triggered'.padEnd(width)}   ${view.triggeredAt}`,
  ];
  if (view.links.length > 0) {
    lines.push('', ...view.links.map((l) => `  ${l.label}: ${l.url}`));
  }
  lines.push('', '-- tor-sockets federated monitor');
  return lines.join('\n');
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
};

/**
 * HTML body: a two-column table. Inline styles only and no external assets -
 * mail clients strip <style> blocks and block remote content by default.
 */
export function renderHtml(view: AlertView): string {
  const accent = SEVERITY_COLOR[view.severity] ?? '#6b7280';
  const rows = view.fields
    .map(
      (f) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(f.label)}</td>` +
        `<td style="padding:4px 0;color:#111827;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(f.value)}</td></tr>`,
    )
    .join('');
  const links = view.links
    .map(
      (l) =>
        `<a href="${escapeHtml(l.url)}" style="color:#7c3aed;text-decoration:none;font-size:13px">${escapeHtml(l.label)} →</a>`,
    )
    .join('&nbsp;&nbsp;·&nbsp;&nbsp;');

  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;color:#111827">',
    `<div style="border-left:4px solid ${accent};padding:0 0 0 12px;margin-bottom:16px">`,
    `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${accent}">${escapeHtml(view.severity)} · ${escapeHtml(view.ruleName)}</div>`,
    `<div style="font-size:18px;font-weight:600;margin-top:4px">${escapeHtml(view.title)}</div>`,
    '</div>',
    `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">${rows}</table>`,
    links ? `<div style="margin-bottom:16px">${links}</div>` : '',
    `<div style="border-top:1px solid #e5e7eb;padding-top:12px;color:#6b7280;font-size:12px">Triggered ${escapeHtml(view.triggeredAt)} · tor-sockets federated monitor</div>`,
    '</div>',
  ].join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
