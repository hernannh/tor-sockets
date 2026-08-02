/**
 * Geo label helpers - ISO 3166-1 alpha-2 → flag emoji + readable name.
 *
 * No bundled dataset: the flag is built with the Regional Indicator trick and
 * the name comes from `Intl.DisplayNames`. Both run in RSC and client.
 */
const REGION =
  typeof Intl !== 'undefined' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

export function countryFlag(cc: string | null | undefined): string {
  if (!cc || cc.length !== 2 || !/^[a-zA-Z]{2}$/.test(cc)) return '';
  return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function countryName(cc: string | null | undefined): string {
  if (!cc) return '';
  try {
    return REGION?.of(cc.toUpperCase()) ?? cc.toUpperCase();
  } catch {
    return cc.toUpperCase();
  }
}
