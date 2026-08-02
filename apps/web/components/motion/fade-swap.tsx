'use client';

import { animate } from 'animejs';
import { type ReactNode, useEffect, useRef } from 'react';

/**
 * Fades its content in on mount. Give it a `key` that changes with the data it
 * wraps and the swap reads as a transition instead of a jump.
 *
 * Content renders in its final state and the tween starts from the effect, so
 * `prefers-reduced-motion` and a JS failure both leave it plainly visible.
 */
export function FadeSwap({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const animation = animate(el, {
      opacity: [0, 1],
      y: [6, 0],
      duration: 220,
      ease: 'outQuad',
    });

    return () => {
      animation.pause();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
