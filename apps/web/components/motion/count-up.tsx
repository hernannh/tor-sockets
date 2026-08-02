'use client';

import { animate } from 'animejs';
import { useEffect, useRef } from 'react';

/**
 * Animates a number from 0 to `value` once it scrolls into view. `format`
 * controls the rendered string (defaults to a grouped integer) so callers can
 * reuse the dashboard's compact/HHI formatters.
 *
 * The final value is what renders on the server, so the figure is correct with
 * JS off and under `prefers-reduced-motion` (where the count never starts); the
 * tween writes `textContent` directly rather than re-rendering React 60 times.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString('en-US'));
  const fmtRef = useRef(fmt);
  fmtRef.current = fmt;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const counter = { n: 0 };
    let animation: ReturnType<typeof animate> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          animation = animate(counter, {
            n: value,
            duration: 1100,
            ease: 'out(4)',
            onUpdate: () => {
              el.textContent = fmtRef.current(counter.n);
            },
            onComplete: () => {
              el.textContent = fmtRef.current(value);
            },
          });
        }
      },
      { rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      animation?.pause();
      el.textContent = fmtRef.current(value);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {fmt(value)}
    </span>
  );
}
