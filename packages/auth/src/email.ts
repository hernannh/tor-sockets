import nodemailer from 'nodemailer';

/**
 * SMTP email delivery for operator-account verification (and future notifications).
 *
 * The transport is built lazily from SMTP_* env vars and is a no-op when
 * `SMTP_HOST` is unset (local dev). That way email verification can be gated on
 * `!!SMTP_HOST` without breaking signup/login in environments without a mail
 * server.
 */

let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER || process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' }
          : undefined,
    });
  }
  return transport;
}

/** True when SMTP is configured and emails can actually be sent. */
export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

// Dev-only convenience: when SMTP is NOT configured, log the verification link
// to the server console so the flow can be exercised locally. NEVER set this in
// production - real deployments use SMTP_HOST.
const DEV_LOG_VERIFICATION = process.env.DEV_LOG_VERIFICATION === 'true';

/** Whether signup should require a verified email before login. */
export function shouldRequireEmailVerification(): boolean {
  return isEmailConfigured() || DEV_LOG_VERIFICATION;
}

/**
 * Refuse to start a production instance whose email verification would be off.
 *
 * `shouldRequireEmailVerification()` is derived from `!!SMTP_HOST`, which makes
 * a missing SMTP config *silently* turn signup into "anyone gets an account,
 * nobody proves an address" - no error, no warning, just a weaker system than
 * the docs describe. That is how it shipped: the production compose file never
 * passed SMTP_* through, so the control was off on every deploy.
 *
 * Set `ALLOW_UNVERIFIED_SIGNUP=true` to run without mail on purpose (a private
 * instance with a single known operator). The point is that it becomes a
 * decision someone wrote down, instead of an accident.
 */
export function assertEmailConfiguredInProduction(): void {
  if (process.env.NODE_ENV !== 'production') return;
  // `next build` runs with NODE_ENV=production and evaluates the module scope of
  // every route to collect page data - including `api/auth/[...all]`, which
  // constructs the auth instance. Nothing is being served at that point, so the
  // check is meaningless there and would only make the image impossible to build
  // anywhere the runtime secrets are absent (CI, a release box). The invariant
  // is about a running server, so it is enforced when one starts.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (isEmailConfigured()) return;
  if (process.env.ALLOW_UNVERIFIED_SIGNUP === 'true') return;
  throw new Error(
    'SMTP_HOST is not set: email verification would be silently disabled and ' +
      'signup would be open to unverified addresses. Configure SMTP_*, or set ' +
      'ALLOW_UNVERIFIED_SIGNUP=true to accept that trade-off explicitly.',
  );
}

/** Where a freshly verified operator should land. */
const VERIFIED_REDIRECT = '/login?verified=1';

/**
 * Point the verification link at the login page instead of the landing page.
 *
 * better-auth bakes the post-verification destination into the link itself, and
 * it takes that value from the REQUEST BODY of whatever triggered the email
 * (`ctx.body.callbackURL`), defaulting to "/". The `emailVerification.callbackURL`
 * option we used to set in the auth config is never read by the library - dead
 * configuration that reads as if it works. The symptom was quiet: verification
 * succeeded, the account was marked verified, and the operator was dropped on
 * the public landing with no indication anything had happened.
 *
 * Rewriting the URL here rather than passing `callbackURL` per call site means
 * signup, resend and any future trigger all land in the same place without
 * having to remember.
 */
function withVerifiedRedirect(verifyUrl: string): string {
  try {
    const url = new URL(verifyUrl);
    url.searchParams.set('callbackURL', VERIFIED_REDIRECT);
    return url.toString();
  } catch {
    // Not a URL we can parse: send it untouched rather than lose the token.
    return verifyUrl;
  }
}

/**
 * Send the operator-account verification email. No-op without SMTP configured
 * unless DEV_LOG_VERIFICATION is on, in which case the link is logged server-side.
 * `verifyUrl` is the full link better-auth generated (carries the one-time token).
 */
export async function sendVerificationEmail(to: string, rawVerifyUrl: string): Promise<void> {
  const verifyUrl = withVerifiedRedirect(rawVerifyUrl);
  if (!isEmailConfigured() && DEV_LOG_VERIFICATION) {
    console.log(`[auth] verification link for ${to}:\n  ${verifyUrl}`);
    return;
  }
  const t = getTransport();
  if (!t) return;
  const from = process.env.SMTP_FROM ?? 'tor-sockets@localhost';
  await t.sendMail({
    from,
    to,
    subject: 'Verify your Tor-Sockets operator account',
    text: `Welcome to Tor-Sockets. Verify your operator account by opening this link:\n\n${verifyUrl}\n\nIf you did not create this account, ignore this email.`,
    html: `<p>Welcome to Tor-Sockets.</p><p>Verify your operator account: <a href="${verifyUrl}">verify email</a></p><p style="color:#888;font-size:12px">If you did not create this account, ignore this email.</p>`,
  });
}
