'use client';

import { useRevealOnce } from '@/components/landing/use-reveal-once';
import { svg, utils } from 'animejs';

/**
 * The pipeline is a real, ordered sequence - ingestion → analysis → materialize
 * → serve → federate - so numbered markers carry information here, not decor.
 *
 * That order is also why the section animates as a pipeline rather than a fade:
 * each stage lands, pulses once, and only then does the connector draw towards
 * the next one, so the eye follows the same path a datum takes. The markup ships
 * in its final state and the entry state is only applied once the timeline is
 * built, so no-JS and reduced-motion readers get the whole section immediately.
 */
const STEPS = [
  {
    n: '01',
    title: 'Ingest',
    body: 'Onionoo is the primary source, with the signed consensus as fallback and CollecTor for history. Polled hourly with If-Modified-Since and gzip.',
  },
  {
    n: '02',
    title: 'Analyze',
    body: 'Concentration is computed per dimension and per role (HHI on path-selection probabilities). Four detectors run after each snapshot: HHI jumps, Sybil clusters, rapid weight gain, consensus divergence.',
  },
  {
    n: '03',
    title: 'Materialize',
    body: 'Snapshots and anomalies are written once by a single worker. Every derived metric carries a provenance sources[] so it stays auditable.',
  },
  {
    n: '04',
    title: 'Serve',
    body: 'The Next.js dashboard, a documented REST + OpenAPI API, and CSV export all read the pre-computed snapshots - there is no heavy compute in the request path.',
  },
  {
    n: '05',
    title: 'Federate',
    body: 'Peer instances pull signed snapshots and cross-verify them. The protocol is open and versioned; any third party can implement it and join.',
  },
];

export function HowItWorks() {
  const root = useRevealOnce((tl) => {
    const lines = svg.createDrawable('.step-line');

    utils.set('.step-node', { opacity: 0, scale: 0.8 });
    utils.set('.step-ring', { opacity: 0, scale: 1 });
    utils.set('.step-copy', { opacity: 0, y: 12 });
    utils.set(lines, { draw: '0 0' });

    STEPS.forEach((_, i) => {
      const step = `[data-step="${i}"]`;
      tl.add(`${step} .step-node`, { opacity: 1, scale: [0.8, 1], ease: 'outBack' })
        .add(`${step} .step-ring`, { opacity: [0.55, 0], scale: [1, 2.2], duration: 780 }, '<')
        .add(`${step} .step-copy`, { opacity: 1, y: [12, 0] }, '<+=80');

      if (lines[i]) {
        tl.add(lines[i], { draw: '0 1', duration: 460, ease: 'inOutQuad' }, '<+=120');
      }
    });
  });

  return (
    <section ref={root} className="border-y border-border bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          How a derived number stays trustworthy
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Every figure on the dashboard is traceable back to the signed consensus. Nothing is
          invented, and nothing depends on a single upstream.
        </p>
        <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.n} data-step={i} className="relative flex h-full flex-col gap-3">
              <span className="step-node relative inline-flex size-8 items-center justify-center rounded-full border border-primary/40 bg-card font-mono text-xs font-semibold text-primary">
                {s.n}
                <span
                  aria-hidden="true"
                  className="step-ring pointer-events-none absolute inset-0 rounded-full border border-primary"
                />
              </span>
              <h3 className="step-copy font-display text-base font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="step-copy text-sm text-pretty text-muted-foreground">{s.body}</p>

              {i < STEPS.length - 1 ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 1"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute top-4 -right-6 left-10 hidden h-px w-auto text-primary/30 lg:block"
                >
                  <path
                    className="step-line"
                    d="M0 0.5 H100"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
