import 'server-only';
import { getAuth } from '@tor-sockets/auth';
import { headers } from 'next/headers';
import { cache } from 'react';

/**
 * Read the current operator session in a Server Component / Route Handler.
 * Returns `{ user, session }` or `null` when not authenticated.
 *
 * Wrapped in React.cache() so the session resolves once per request even when
 * several components in the same tree call it (e.g. the /operator layout and its
 * page both read it) - without it, better-auth re-resolves the cookie on every
 * call within a single render.
 */
export const getSession = cache(async () => {
  const auth = getAuth();
  const h = await headers();
  return auth.api.getSession({ headers: h });
});

/** The logged-in operator id, or null. Convenience wrapper. */
export async function getOperatorId(): Promise<string | null> {
  const s = await getSession();
  return s?.user.id ?? null;
}
