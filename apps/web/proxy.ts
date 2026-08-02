import { type NextRequest, NextResponse } from 'next/server';

/**
 * Next 16 renamed the `middleware` file convention to `proxy` (same runtime,
 * same matcher semantics; the file must export a function named `proxy`).
 *
 * Per-IP rate limiting for the public attack surface: the auth flow (login,
 * signup, TOTP verification), the anonymous federation subscribe endpoint, the
 * operator server actions, and the public API/federation GETs (heavy SQL).
 *
 * --- Client identity ---
 * `x-forwarded-for` is a client-writable header: whoever connects can put
 * anything in it. Reading the LEFTMOST entry therefore lets an attacker mint a
 * fresh bucket per request and bypass the limit entirely. The correct value is
 * the entry appended by our own trusted proxy, counted from the RIGHT:
 *
 *   XFF: "spoofed, spoofed, <real client>"   <- 1 trusted proxy (nginx/Caddy)
 *   XFF: "spoofed, <real client>, <cdn ip>"  <- 2 trusted hops (CDN + proxy)
 *
 * `TRUSTED_PROXY_HOPS` (default 1) says how many proxies sit in front of this
 * app. Set it to 0 when the app is exposed directly: the header is then ignored
 * entirely and every request shares one bucket (fail closed - a shared bucket
 * throttles too much, never too little).
 *
 * Storage is in-memory: correct for the planned single `web` container. With
 * multiple replicas the counter must move to Redis (REDIS_URL already exists),
 * otherwise the effective limit multiplies by the replica count.
 */

interface Bucket {
  hits: number[];
  /** Last touch, for eviction ordering. */
  seen: number;
}

const STORE = new Map<string, Bucket>();
const STORE_CAP = 50_000;
const WINDOW_MS = 60_000;

/** Per-class limits, per minute. Tighter classes come first when matching. */
const LIMITS = {
  auth: 5, // sign-in / sign-up: credential brute force, account flooding
  totp: 10, // 2FA verification: code guessing (better-auth also locks out)
  action: 30, // operator server actions (POST to /operator/*)
  subscribe: 5, // anonymous federation peer registration
  api: 200, // public API + federation reads
} as const;

type LimitClass = keyof typeof LIMITS;

const TRUSTED_PROXY_HOPS = (() => {
  const raw = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '', 10);
  if (Number.isInteger(raw) && raw >= 0 && raw <= 5) return raw;
  return 1; // default deployment: one reverse proxy terminating TLS
})();

const IPISH = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * The address our trusted proxy observed. Never trusts client-controlled
 * positions of the header.
 */
function clientIp(req: NextRequest): string {
  if (TRUSTED_PROXY_HOPS === 0) return 'direct';
  const fwd = req.headers.get('x-forwarded-for');
  if (!fwd || fwd.length > 1024) return 'unknown';
  const parts = fwd
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const candidate = parts[parts.length - TRUSTED_PROXY_HOPS];
  if (candidate && IPISH.test(candidate)) return candidate;
  // Header present but shorter than the configured hop count -> someone is
  // playing with it (or the proxy chain is misconfigured). Share one bucket
  // rather than hand out a free pass.
  return 'unknown';
}

function classify(path: string, method: string): LimitClass | null {
  if (path.startsWith('/api/auth/')) {
    if (path.includes('two-factor')) return 'totp';
    if (path.includes('sign-in') || path.includes('sign-up') || path.includes('forget-password')) {
      return 'auth';
    }
    return null; // session/sign-out etc: better-auth's own limiter covers these
  }
  if (path === '/federation/v1/subscribe') return 'subscribe';
  if (path.startsWith('/api/v1/') || path.startsWith('/federation/v1/')) return 'api';
  // Server actions are POSTs to the page route itself; the operator surface is
  // the sensitive one (claims, peers, alert rules).
  if (method === 'POST' && path.startsWith('/operator')) return 'action';
  return null;
}

/**
 * Drop buckets whose window has fully expired; if the store is still over
 * capacity, evict the least-recently-seen entries. Never wipes the whole store
 * (a flood of distinct keys would otherwise reset everyone's counters - a free
 * bypass for whoever triggers it).
 */
function evict(now: number): void {
  for (const [key, bucket] of STORE) {
    if (now - bucket.seen >= WINDOW_MS) STORE.delete(key);
    if (STORE.size <= STORE_CAP) break;
  }
  if (STORE.size <= STORE_CAP) return;
  const overflow = STORE.size - STORE_CAP;
  const oldest = [...STORE.entries()].sort((a, b) => a[1].seen - b[1].seen).slice(0, overflow);
  for (const [key] of oldest) STORE.delete(key);
}

function hit(key: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  if (STORE.size > STORE_CAP) evict(now);

  const bucket = STORE.get(key);
  const recent = bucket ? bucket.hits.filter((t) => now - t < WINDOW_MS) : [];
  if (recent.length >= limit) {
    STORE.set(key, { hits: recent, seen: now });
    return { allowed: false, remaining: 0 };
  }
  recent.push(now);
  STORE.set(key, { hits: recent, seen: now });
  return { allowed: true, remaining: limit - recent.length };
}

// --- Content-Security-Policy ---

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Routes that render per request and therefore CAN carry a script nonce.
 *
 * Next only stamps the nonce onto its script tags while rendering dynamically -
 * a prerendered page is baked at build time, when no nonce exists yet. Sending
 * `'strict-dynamic'` to such a page would block its own bundles and leave a
 * blank screen, so the nonce policy is opt-in per route instead of global.
 * These are exactly the routes that either hold a session (/operator) or render
 * operator-controlled strings from the consensus (`contact`, `nickname`), which
 * is where script injection would actually land.
 *
 * Anything not listed keeps the compatible policy. Drift is caught by
 * `e2e/security-headers.spec.ts`, which asserts that every nonce route really
 * does nonce all of its script tags.
 */
const NONCE_ROUTES = [
  '/operator',
  '/relays',
  '/families',
  '/correlation',
  '/trends',
  '/network-history',
  '/api/docs',
];

function usesNonce(path: string): boolean {
  return NONCE_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

/**
 * Per-request CSP. On nonce routes every script must carry the nonce minted
 * here, so markup injected through a relay field cannot execute even if it
 * reaches the DOM. Elsewhere inline scripts stay allowed (Next's prerendered
 * hydration payload is inline and unsigned) while the rest of the policy -
 * no objects, no framing, no foreign origins - still applies. Dev keeps eval
 * because Turbopack HMR needs it.
 */
function contentSecurityPolicy(nonce: string, nonced: boolean): string {
  const scriptSrc = !IS_PROD
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : nonced
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    scriptSrc,
    // Inline styles stay allowed: Next and styled-jsx emit them, and a style
    // injection is not script execution.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function proxy(req: NextRequest) {
  const limitClass = classify(req.nextUrl.pathname, req.method);

  if (limitClass) {
    const limit = LIMITS[limitClass];
    const result = hit(`${limitClass}:${clientIp(req)}`, limit);
    if (!result.allowed) {
      return NextResponse.json(
        { error: { code: 'rate_limited', message: 'too many requests, slow down' } },
        {
          status: 429,
          headers: {
            'retry-after': String(Math.ceil(WINDOW_MS / 1000)),
            'x-ratelimit-limit': String(limit),
            'x-ratelimit-remaining': '0',
          },
        },
      );
    }
    const response = withCsp(req);
    response.headers.set('x-ratelimit-limit', String(limit));
    response.headers.set('x-ratelimit-remaining', String(Math.max(0, result.remaining)));
    return response;
  }

  return withCsp(req);
}

function withCsp(req: NextRequest): NextResponse {
  const nonced = usesNonce(req.nextUrl.pathname);
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, nonced);

  if (!nonced) {
    const plain = NextResponse.next();
    plain.headers.set('content-security-policy', csp);
    return plain;
  }

  // Both must travel on the REQUEST: `x-nonce` for route handlers that build
  // their own HTML, and the CSP header itself because that is where Next looks
  // for the nonce it stamps onto its script tags.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Everything except static assets and image-optimizer output: pages need the
  // CSP, API and operator routes need the limiter, and neither applies to files
  // served straight from /_next/static or /public.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|swagger-ui/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)',
  ],
};
