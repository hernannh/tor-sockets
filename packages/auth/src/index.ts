import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { type Database, getDb, operators } from '@tor-sockets/db';
import * as schema from '@tor-sockets/db/schema';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import {
  assertEmailConfiguredInProduction,
  sendVerificationEmail,
  shouldRequireEmailVerification,
} from './email';

/**
 * better-auth instance for operator accounts (Fase 3.2).
 *
 * Email/password + sessions. The Drizzle adapter binds to the shared
 * `getDb()` client and the full schema (so it sees the auth tables + the
 * existing relay tables).
 *
 * On signup, a `databaseHooks.user.create.after` hook mirrors the user into
 * the legacy `operators` table (same id) so existing FKs on
 * `operator_claims.operator_id` keep holding.
 */

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Origins allowed to drive the auth endpoints (CSRF + open-redirect guard on
 * `callbackURL`). Defaults to the configured public URL; extra origins can be
 * added via AUTH_TRUSTED_ORIGINS (comma-separated) for a staging host.
 */
function trustedOrigins(): string[] {
  const configured = [
    process.env.BETTER_AUTH_URL,
    process.env.TOR_SOCKETS_BASE_URL,
    ...(process.env.AUTH_TRUSTED_ORIGINS ?? '').split(','),
  ]
    .map((o) => o?.trim())
    .filter((o): o is string => !!o);
  const origins = new Set(configured);
  if (!isProduction()) {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:3001');
  }
  return [...origins];
}

function createAuth(db: Database) {
  assertEmailConfiguredInProduction();
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    trustedOrigins: trustedOrigins(),
    // Second rate-limiting layer, inside better-auth itself: the edge proxy
    // buckets by client IP, this one applies per auth endpoint regardless of how
    // the request reached us (and stays correct if the proxy chain is
    // misconfigured). Credential and code-guessing endpoints get the tight caps.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
        '/forget-password': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
        '/two-factor/verify-totp': { window: 60, max: 10 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/two-factor/enable': { window: 60, max: 5 },
        '/two-factor/disable': { window: 60, max: 5 },
      },
    },
    advanced: {
      // Session cookies must never travel over plaintext in production; the
      // flag is derived from NODE_ENV rather than the URL so a misconfigured
      // BETTER_AUTH_URL cannot silently downgrade them.
      useSecureCookies: isProduction(),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction(),
      },
    },
    // Require a verified email ONLY when SMTP is configured. In local dev
    // (no SMTP_HOST) this stays false, so signup/login work without a mail
    // server. In production it forces email verification - a cheap, effective
    // gate against throwaway-email Sybil accounts reaching the operator surface.
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: shouldRequireEmailVerification(),
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendVerificationEmail(user.email, url);
      },
      sendOnSignUp: shouldRequireEmailVerification(),
      // NOTE: there is no `callbackURL` option here on purpose. better-auth
      // ignores it - the post-verification destination is baked into the link
      // from the triggering request's body, defaulting to "/". Setting it here
      // looked correct and did nothing: verified operators landed on the public
      // landing page. `withVerifiedRedirect` in ./email rewrites the link
      // instead, which covers every trigger.
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    // TOTP two-factor auth (better-auth plugin). Optional per operator; the
    // privilege gate in operator/actions requires it for federation peer
    // actions. Adding the plugin does not affect existing logins (users without
    // 2FA sign in normally) - only the /two-factor/* endpoints need the tables.
    plugins: [
      twoFactor({
        // The issuer is the label an authenticator app shows next to the code,
        // so it wants a product name, not a URL. Defaulting to BETTER_AUTH_URL
        // put the whole origin there: entries registered as
        // "https://monitor.example.org" instead of "Tor-Sockets", percent-encoded
        // inside the otpauth:// URI. Overridable for operators who run several
        // instances and need to tell them apart in the same app.
        issuer: process.env.TOTP_ISSUER ?? 'Tor-Sockets',
        skipVerificationOnEnable: false,
      }),
    ],
    user: {
      additionalFields: {
        displayName: {
          type: 'string',
          required: false,
          input: true,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (u: {
            id: string;
            email: string;
            name: string;
            displayName?: string | null;
          }) => {
            await db
              .insert(operators)
              .values({
                id: u.id,
                email: u.email,
                displayName: (u as { displayName?: string }).displayName ?? u.name,
              })
              .onConflictDoNothing();
          },
        },
      },
    },
  });
}

let _auth: ReturnType<typeof createAuth> | null = null;

export function getAuth(db?: Database) {
  if (_auth) return _auth;
  _auth = createAuth(db ?? getDb(process.env.DATABASE_URL));
  return _auth;
}

export type Auth = ReturnType<typeof getAuth>;

export const PACKAGE_NAME = '@tor-sockets/auth';
