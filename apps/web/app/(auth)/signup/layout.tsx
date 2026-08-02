import type { Metadata } from 'next';

/** Title for /signup - see the note in ../login/layout.tsx. */
export const metadata: Metadata = {
  title: 'Create operator account',
  // Auth screens are per-user and must never rank; still followed for links.
  robots: { index: false, follow: true },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
