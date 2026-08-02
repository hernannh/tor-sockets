import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Condensed,
  Space_Grotesk,
} from 'next/font/google';

/**
 * Type system for Tor-Sockets (Onion Amethyst direction).
 *
 * - Space Grotesk: display face for headlines / hero (restrained use). Carries
 *   the page's personality without touching the data.
 * - Plex Mono: data, fingerprints, large KPI numerals, the logotype. The data
 *   *is* the headline on a monitoring product, so the data face carries the
 *   brand voice.
 * - Plex Sans: body copy and headings.
 * - Plex Sans Condensed: UPPERCASE eyebrows / instrument-style labels.
 *
 * Static families in Google Fonts, hence explicit weight arrays. Variables are
 * pinned to stable names so globals.css does not couple to next/font internals.
 */
export const fontDisplay = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-space-grotesk',
});
export const fontSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ibm-plex-sans',
});

export const fontMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-ibm-plex-mono',
});

export const fontCondensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ibm-plex-condensed',
});
