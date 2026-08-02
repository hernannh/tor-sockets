import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Static security headers applied to every route. The Content-Security-Policy
// is NOT here: it is minted per request in `proxy.ts` so each response
// carries its own script nonce ('unsafe-inline' is gone in production). Keeping
// a second static CSP would only weaken that one, since browsers enforce every
// policy they receive against the same script.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  // Local peering: a second instance on another port uses its own .next
  // directory, so Next does not treat it as a duplicate dev server.
  distDir: process.env.PEER_MODE ? '.next-peer' : '.next',
  transpilePackages: [
    '@tor-sockets/db',
    '@tor-sockets/ingestion-core',
    '@tor-sockets/federation',
    '@tor-sockets/analysis',
    '@tor-sockets/auth',
    '@tor-sockets/api-contract',
  ],
  // `radix-ui` ships a single barrel entry that isn't in Next's built-in
  // optimizePackageImports list (lucide-react and recharts already are).
  // Listing it here rewrites barrel imports to deep paths so only the primitives
  // used are bundled, instead of the whole barrel on every route.
  experimental: {
    optimizePackageImports: ['radix-ui'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
