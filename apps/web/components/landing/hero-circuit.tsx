'use client';

import { animate, createScope, stagger } from 'animejs';
import { useEffect, useRef } from 'react';

/**
 * Signature element: a live Tor circuit. Three relays - guard → middle → exit -
 * with a "packet" travelling the path on a loop. This is the one place the brand
 * spends its motion budget.
 *
 * The SVG renders as a static, gently-glowing diagram; the loops are layered on
 * afterwards, so `prefers-reduced-motion` (and a JS failure) leave exactly that
 * static diagram - no travelling packet, no pulsing halos.
 */
const NODES = [
  { x: 90, fill: 'var(--role-guard)', label: 'guard' },
  { x: 250, fill: 'var(--role-middle)', label: 'middle' },
  { x: 410, fill: 'var(--role-exit)', label: 'exit' },
] as const;

export function HeroCircuit() {
  const root = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const scope = createScope({ root }).add(() => {
      animate('.circuit-halo', {
        scale: [1, 1.16, 1],
        opacity: [0.12, 0.26, 0.12],
        duration: 2600,
        delay: stagger(450),
        ease: 'inOutSine',
        loop: true,
      });

      animate('.circuit-packet', {
        cx: [NODES[0].x, NODES[1].x, NODES[2].x],
        duration: 2800,
        ease: 'inOutSine',
        loop: true,
      });
    });

    return () => scope.revert();
  }, []);

  return (
    <svg
      ref={root}
      viewBox="0 0 500 210"
      className="h-auto w-full"
      role="img"
      aria-label="Animated Tor circuit: a packet travelling guard, middle, and exit relays"
    >
      <line x1="90" y1="105" x2="410" y2="105" stroke="var(--border)" strokeWidth="2" />
      {NODES.map((n) => (
        <g key={n.label}>
          <circle
            className="circuit-halo"
            cx={n.x}
            cy={105}
            r={34}
            fill={n.fill}
            opacity={0.18}
            style={{ transformOrigin: `${n.x}px 105px` }}
          />
          <circle cx={n.x} cy={105} r={16} fill={n.fill} />
          <text
            x={n.x}
            y={158}
            textAnchor="middle"
            fontSize={13}
            fontFamily="var(--font-mono)"
            fill="var(--muted-foreground)"
          >
            {n.label}
          </text>
        </g>
      ))}
      <circle className="circuit-packet" cx={250} cy={105} r={6} fill="var(--primary)" />
    </svg>
  );
}
