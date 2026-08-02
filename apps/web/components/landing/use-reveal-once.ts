'use client';

import { type Timeline, createScope, createTimeline } from 'animejs';
import { useEffect, useRef } from 'react';

/**
 * Landing reveal: build a paused Anime.js timeline scoped to a section, then
 * play it the first time that section reaches the viewport.
 *
 * The policy lives here so every animated section agrees on it:
 *
 *  - reduced motion bails out before the scope is ever created, which means the
 *    entry state is never applied and the section renders complete;
 *  - the markup always ships in its final state, so a JS failure degrades to a
 *    static section rather than an invisible one;
 *  - an IntersectionObserver drives playback instead of Anime's `onScroll`,
 *    whose relative thresholds (`bottom-=120`) never fired here and left the
 *    content hidden;
 *  - `createScope({ root })` confines selectors to the section and `revert()`
 *    undoes every style on unmount.
 *
 * `build` receives the paused timeline and runs inside the scope, so it can use
 * plain selectors and `utils.set` for the entry state.
 */
export function useRevealOnce<T extends HTMLElement = HTMLElement>(build: (tl: Timeline) => void) {
  const root = useRef<T>(null);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let timeline: Timeline | null = null;

    const scope = createScope({ root }).add(() => {
      const tl = createTimeline({
        defaults: { ease: 'outQuad', duration: 420 },
        autoplay: false,
      });
      buildRef.current(tl);
      timeline = tl;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          timeline?.play();
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    if (root.current) observer.observe(root.current);

    return () => {
      observer.disconnect();
      scope.revert();
    };
  }, []);

  return root;
}
