'use client';

import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side auth client. Every interactive auth action goes through it:
 * signup, login, the TOTP challenge, enabling 2FA.
 *
 * `baseURL` is deliberately NOT set. Omitting it makes better-auth resolve to
 * the relative `/api/auth`, i.e. whatever origin served the page - correct in
 * dev on localhost, correct in production, and correct on whatever host the
 * instance moves to, with no rebuild.
 *
 * It used to read `process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'`,
 * and that fallback shipped to production because the variable was never set
 * there. The result: the browser posted signup to http://localhost:3000 - the
 * VISITOR's own machine - and since the page is served over HTTPS the request
 * was blocked outright as mixed content. The form span its spinner forever, no
 * user was ever created, and nothing appeared in the server logs because no
 * request had reached the server. The whole interactive auth surface was dead in
 * production while the same endpoints answered fine over curl.
 *
 * Two reasons not to "fix" it by setting NEXT_PUBLIC_BASE_URL: Next inlines
 * NEXT_PUBLIC_* at BUILD time, so setting it in .env at deploy time would not
 * have worked at all; and baking an origin into the image ties that image to one
 * hostname. A relative path has neither problem.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
export const twoFactor = authClient.twoFactor;
