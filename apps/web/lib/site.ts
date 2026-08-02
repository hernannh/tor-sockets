/**
 * Canonical location of the source repository.
 *
 * It lives in one place because it is rendered in three that must never
 * disagree: the clone command on the landing page, the footer link, and the
 * `codeRepository` field of the JSON-LD graph, which is what tells a crawler
 * where the source actually lives.
 *
 * A plain constant rather than an environment variable on purpose: the landing
 * is a client component, and `NEXT_PUBLIC_*` values are inlined at build time,
 * so an env var would look configurable per deployment while behaving like a
 * constant anyway.
 *
 * While this is empty the repository link is simply not rendered, and the clone
 * command falls back to a placeholder, so a fork with no public home of its own
 * still builds and ships without a dead link.
 */
export const REPO_URL = 'https://github.com/hernannh/tor-sockets';

/** The clone command shown on the landing page. */
export const CLONE_URL = REPO_URL || '<repository-url>';
