import { LandingStructuredData } from '@/components/structured-data';
import { getConcentration, getStats } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

// The landing sections pull in animejs (~50 KB) for motion that only starts in
// useEffect and is already gated behind prefers-reduced-motion. Splitting each
// section into its own chunk keeps animejs out of the route's initial bundle so
// it never delays the hero's first paint. SSR stays on: the static markup/SVG
// renders immediately and the motion chunk hydrates after.
const CtaSelfHost = dynamic(() =>
  import('@/components/landing/cta-self-host').then((m) => m.CtaSelfHost),
);
const Differentials = dynamic(() =>
  import('@/components/landing/differentials').then((m) => m.Differentials),
);
const Hero = dynamic(() => import('@/components/landing/hero').then((m) => m.Hero));
const HowItWorks = dynamic(() =>
  import('@/components/landing/how-it-works').then((m) => m.HowItWorks),
);
const LiveSnapshot = dynamic(() =>
  import('@/components/landing/live-snapshot').then((m) => m.LiveSnapshot),
);
const OpenData = dynamic(() => import('@/components/landing/open-data').then((m) => m.OpenData));

// Data changes at most once per hour (consensus cycle). Revalidate the static
// render every 60s so a fresh consensus shows up within a minute.
export const revalidate = 60;

const DESCRIPTION =
  'Federated, real-time monitor of Tor network concentration and health. How much guard and exit weight sits in one country, AS, or operator - with anomaly detection, alerts, and an open federation protocol.';
const TITLE = 'Tor-Sockets - who controls your circuit?';

export function generateMetadata(): Metadata {
  return {
    description: DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: '/',
      title: TITLE,
      description: DESCRIPTION,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: TITLE }],
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
      images: ['/opengraph-image'],
    },
  };
}

export default async function LandingPage() {
  let stats: Awaited<ReturnType<typeof getStats>> | null = null;
  let concentration: Awaited<ReturnType<typeof getConcentration>> = null;
  try {
    const db = getDb(process.env.DATABASE_URL);
    [stats, concentration] = await Promise.all([getStats(db), getConcentration(db, 'as', 8)]);
  } catch {
    // DB unreachable (e.g. build time) - degrade; the page revalidates in 60s.
    stats = null;
    concentration = null;
  }

  const relaysRunning = stats?.relays_running ?? 0;
  const hhi = concentration?.hhi ?? null;

  return (
    <>
      <LandingStructuredData relayCount={relaysRunning} />
      <Hero relaysRunning={relaysRunning} hhi={hhi} />
      {stats ? <LiveSnapshot stats={stats} /> : null}
      <Differentials />
      <HowItWorks />
      <OpenData />
      <CtaSelfHost />
    </>
  );
}
