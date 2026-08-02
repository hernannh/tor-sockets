import { fontCondensed, fontDisplay, fontMono, fontSans } from '@/lib/fonts';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Tor-Sockets - who controls your circuit?',
    template: '%s · Tor-Sockets',
  },
  description:
    'Federated, real-time monitor of Tor network concentration and health. How much guard and exit weight sits in one country, AS, or operator - with anomaly detection, alerts, and an open federation protocol.',
  // Absolute URLs in Open Graph and canonical tags are resolved against
  // this. It follows the deployment, so it reads the same variable the
  // federation actor document does.
  metadataBase: new URL(process.env.TOR_SOCKETS_BASE_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable} ${fontCondensed.variable} ${fontDisplay.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  );
}
