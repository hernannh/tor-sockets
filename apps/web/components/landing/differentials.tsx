'use client';

import { useRevealOnce } from '@/components/landing/use-reveal-once';
import { stagger, svg, utils } from 'animejs';
import { Radar, Scale, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ITEMS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Scale,
    title: 'Cross-dimension concentration',
    body: 'A Herfindahl-Hirschman index per country, AS, hosting provider, and operator family - split by guard, middle, and exit, because concentration of guards is not concentration of exits. Each index also reads back as the number of equal-sized operators it amounts to.',
  },
  {
    icon: Radar,
    title: 'Anomaly detection + alerts',
    body: 'Sybil clusters, rapid weight gains, HHI jumps, and consensus divergence are flagged automatically. Route alerts over email, webhook, or Telegram - thresholds you control.',
  },
  {
    icon: Share2,
    title: 'Open federation',
    body: 'Run your own instance and peer with others over a versioned, Ed25519-signed protocol. No single directory owns the data - the network does, and anyone can verify it.',
  },
];

/**
 * Unlike the pipeline below, these three claims have no order between them, so
 * they arrive together on a short stagger instead of one waiting on the last.
 * The accent line drawing across each card top is what ties the section to the
 * pipeline's visual language.
 */
export function Differentials() {
  const root = useRevealOnce((tl) => {
    const lines = svg.createDrawable('.card-line');

    utils.set('.reveal-heading', { opacity: 0, y: 14 });
    utils.set('.reveal-card', { opacity: 0, y: 24 });
    utils.set('.card-icon', { opacity: 0, scale: 0.7 });
    utils.set(lines, { draw: '0 0' });

    tl.add('.reveal-heading', { opacity: 1, y: [14, 0], duration: 520 })
      .add(
        '.reveal-card',
        { opacity: 1, y: [24, 0], duration: 560, delay: stagger(110), ease: 'outCubic' },
        '-=260',
      )
      .add(lines, { draw: '0 1', duration: 620, delay: stagger(110), ease: 'inOutQuad' }, '<+=120')
      .add(
        '.card-icon',
        { opacity: 1, scale: [0.7, 1], duration: 460, delay: stagger(110), ease: 'outBack' },
        '<+=60',
      );
  });

  return (
    <section ref={root} className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <h2 className="reveal-heading max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Three things this set out to do
      </h2>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {ITEMS.map((it) => (
          <div
            key={it.title}
            className="reveal-card relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card/40 p-6"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 100 1"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-x-0 top-0 h-px w-full text-primary/50"
            >
              <path
                className="card-line"
                d="M0 0.5 H100"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="card-icon inline-flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <it.icon className="size-5" />
            </span>
            <h3 className="font-display text-lg font-semibold tracking-tight">{it.title}</h3>
            <p className="text-sm text-pretty text-muted-foreground">{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
