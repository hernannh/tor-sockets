'use client';

import { useRevealOnce } from '@/components/landing/use-reveal-once';
import { Button } from '@/components/ui/button';
import { CLONE_URL, REPO_URL } from '@/lib/site';
import { animate, stagger, steps, utils } from 'animejs';
import { ExternalLink, Terminal } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

const COMMANDS = [
  `git clone ${CLONE_URL}`,
  'cd tor-sockets',
  'docker compose up -d',
  'pnpm db:migrate && pnpm dev',
];

const MS_PER_CHAR = 22;

/**
 * The claim is "one command stands up the full stack", so the terminal types
 * itself out instead of appearing whole - the reader watches the four commands
 * land in order.
 *
 * The typing is a clip-path wipe stepped once per character (`steps(n)`), not a
 * string being rebuilt: the text is always in the DOM at full width, so nothing
 * reflows, the block stays copy-pasteable, and with JS off or reduced motion the
 * `--typed: 0` default leaves every line fully visible.
 */
export function CtaSelfHost() {
  const root = useRevealOnce((tl) => {
    utils.set('.cta-copy', { opacity: 0, y: 16 });
    utils.set('.cta-action', { opacity: 0, y: 10 });
    utils.set('.cta-terminal', { opacity: 0, y: 24 });
    utils.set('.cmd-line', { '--typed': 100 });
    utils.set('.cmd-caret', { opacity: 0 });

    tl.add('.cta-copy', {
      opacity: 1,
      y: [16, 0],
      duration: 520,
      delay: stagger(120),
      ease: 'outCubic',
    })
      .add(
        '.cta-action',
        { opacity: 1, y: [10, 0], duration: 420, delay: stagger(90), ease: 'outBack' },
        '-=260',
      )
      .add('.cta-terminal', { opacity: 1, y: [24, 0], duration: 560, ease: 'outCubic' }, '-=520');

    COMMANDS.forEach((cmd, i) => {
      tl.add(
        `[data-line="${i}"]`,
        {
          '--typed': 0,
          duration: Math.max(320, cmd.length * MS_PER_CHAR),
          // `ease: 'steps(n)'` as a string was removed from the anime.js core in
          // v4 - it still warned on every landing load. The easing function is
          // imported and called directly now; same stepped wipe, no deprecation.
          ease: steps(cmd.length),
        },
        i === 0 ? '-=120' : '+=180',
      );
    });

    // The caret blinks through anime rather than a CSS `animate-pulse`, which
    // would keep writing opacity and reveal it while the lines are still typing.
    tl.add('.cmd-caret', { opacity: 1, duration: 200 }, '+=120').call(() => {
      animate('.cmd-caret', {
        opacity: [1, 0],
        duration: 560,
        loop: true,
        alternate: true,
        ease: steps(1),
      });
    });
  });

  return (
    <section ref={root} className="border-t border-border bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <div className="rounded-2xl border border-border bg-background/60 p-8 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="cta-copy font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Run your own instance
              </h2>
              <p className="cta-copy mt-4 max-w-md text-muted-foreground">
                One command stands up the full stack - ingestion worker, dashboard, API, and
                federation. Self-hostable, MIT-licensed, federation-ready from the first commit.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {REPO_URL ? (
                  <Button asChild size="lg" className="cta-action">
                    <a href={REPO_URL} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" /> Browse the source
                    </a>
                  </Button>
                ) : null}
                <Button
                  asChild
                  size="lg"
                  variant={REPO_URL ? 'outline' : 'default'}
                  className="cta-action"
                >
                  <Link href="/dashboard">Open the dashboard</Link>
                </Button>
              </div>
            </div>
            <div className="cta-terminal rounded-xl border border-border bg-card/60 p-5 font-mono text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Terminal className="size-4" /> bash
              </div>
              <pre className="mt-3 overflow-x-auto text-foreground">
                <code>
                  {COMMANDS.map((cmd, i) => (
                    <Fragment key={cmd}>
                      <span
                        data-line={i}
                        className="cmd-line inline-block align-top"
                        style={{ clipPath: 'inset(0 calc(var(--typed, 0) * 1%) 0 0)' }}
                      >
                        {cmd}
                      </span>
                      {i < COMMANDS.length - 1 ? '\n' : null}
                    </Fragment>
                  ))}
                  <span className="cta-caret-wrap">
                    {' '}
                    <span
                      aria-hidden="true"
                      className="cmd-caret inline-block h-4 w-2 translate-y-0.5 bg-primary"
                    />
                  </span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
