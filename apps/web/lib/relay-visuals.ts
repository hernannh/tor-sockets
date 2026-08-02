/**
 * Hex colours for the MapLibre WebGL canvas.
 *
 * The map paints on a WebGL canvas, and MapLibre's colour parser only accepts
 * sRGB hex/rgb() - not the oklch()/lab() that the Tailwind v4 token system
 * compiles to in app/globals.css. The DOM layers (popups, legend) keep reading
 * the live tokens via `var(--role-*)`; only the canvas needs concrete hex.
 *
 * These are the sRGB hex Lightning CSS derives from the oklch tokens. If a token
 * changes in globals.css, regenerate the matching value here - it is the `#…`
 * form the bundler emits (same value the browser shows, so canvas and DOM stay
 * visually identical).
 */
export const RELAY_COLORS = {
  guard: '#38b8f6', // --role-guard      oklch(0.74 0.14 235)
  exit: '#f4a437', // --role-exit       oklch(0.78 0.15 70)
  balanced: '#3bcfcf', // --role-balanced  = --primary oklch(0.78 0.12 195)
  background: '#040f15', // --background      oklch(0.16 0.022 230)
} as const;

/**
 * Tailwind class tokens for relay flags (DOM badges). Keys are consensus flag
 * names exactly as stored. Shared by the directory table and the relay detail.
 */
export const FLAG_TONE: Record<string, string> = {
  Guard: 'border-role-guard/30 bg-role-guard/10 text-role-guard',
  Exit: 'border-role-exit/30 bg-role-exit/10 text-role-exit',
  Authority: 'border-role-authority/30 bg-role-authority/10 text-role-authority',
  HSDir: 'border-role-hsdir/30 bg-role-hsdir/10 text-role-hsdir',
};
