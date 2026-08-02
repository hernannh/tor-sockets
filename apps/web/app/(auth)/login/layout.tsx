import type { Metadata } from 'next';

/**
 * Exists only to give /login a title.
 *
 * `page.tsx` here is a client component - it owns form state and the TOTP
 * challenge - and a client component cannot export `metadata`. Without this
 * layout the route inherited the root title, so both auth pages showed up in the
 * browser as "Tor-Sockets - who controls your circuit?", the landing page's
 * title. Every other route follows nav label == h1 == metadata.title; these two
 * were the exceptions because of the client boundary, not by intent.
 */
export const metadata: Metadata = {
  title: 'Sign in',
  // Auth screens are per-user and must never rank; still followed for links.
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
