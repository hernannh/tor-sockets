'use client';

import { useRevealOnce } from '@/components/landing/use-reveal-once';
import { stagger, svg, utils } from 'animejs';
import { FileJson, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

/**
 * Claim on the left, evidence on the right. The reveal follows that reading
 * order: the eyebrow underlines itself, the claim rises, and only then do the
 * two proofs slide in - the section argues before it shows its receipts.
 */
export function OpenData() {
  const root = useRevealOnce((tl) => {
    const rule = svg.createDrawable('.eyebrow-rule');

    utils.set('.reveal-eyebrow', { opacity: 0, y: 8 });
    utils.set('.reveal-claim', { opacity: 0, y: 16 });
    utils.set('.reveal-proof', { opacity: 0, x: 20 });
    utils.set('.proof-icon', { opacity: 0, scale: 0.6 });
    utils.set(rule, { draw: '0 0' });

    tl.add('.reveal-eyebrow', { opacity: 1, y: [8, 0], duration: 380 })
      .add(rule, { draw: '0 1', duration: 520, ease: 'inOutQuad' }, '<+=120')
      .add(
        '.reveal-claim',
        { opacity: 1, y: [16, 0], duration: 520, delay: stagger(120), ease: 'outCubic' },
        '-=380',
      )
      .add(
        '.reveal-proof',
        { opacity: 1, x: [20, 0], duration: 520, delay: stagger(140), ease: 'outCubic' },
        '-=240',
      )
      .add(
        '.proof-icon',
        { opacity: 1, scale: [0.6, 1], duration: 420, delay: stagger(140), ease: 'outBack' },
        '<+=60',
      );
  });

  return (
    <section ref={root} className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="reveal-eyebrow relative inline-block font-condensed text-xs tracking-[0.2em] text-primary uppercase">
            Open by construction
            <svg
              aria-hidden="true"
              viewBox="0 0 100 1"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-x-0 -bottom-1.5 h-px w-full text-primary/60"
            >
              <path
                className="eyebrow-rule"
                d="M0 0.5 H100"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </span>
          <h2 className="reveal-claim mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Built on open data, verifiable by anyone
          </h2>
          <p className="reveal-claim mt-4 text-muted-foreground">
            Every figure is derived from The Tor Project&rsquo;s signed consensus, published under
            CC0 via Onionoo and CollecTor. No proprietary feed, no black box.
          </p>
        </div>
        <ul className="flex flex-col gap-5">
          <li className="reveal-proof flex gap-3">
            <FileJson className="proof-icon mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Public federation actor</p>
              <p className="text-sm text-muted-foreground">
                Discovery document at{' '}
                <Link
                  className="text-primary hover:underline"
                  href="/.well-known/tor-federation.json"
                >
                  /.well-known/tor-federation.json
                </Link>{' '}
                - instance identity, pubkey, sources.
              </p>
            </div>
          </li>
          <li className="reveal-proof flex gap-3">
            <ShieldCheck className="proof-icon mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Signed snapshots</p>
              <p className="text-sm text-muted-foreground">
                Every peer payload is Ed25519-signed. Cross-verify against other instances;
                provenance travels with each metric.
              </p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
