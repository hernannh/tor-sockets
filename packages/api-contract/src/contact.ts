/**
 * Tor ContactInfo parser - shared by the analysis engine (to derive `verified`
 * from `proof:*`) and the web UI (to render a clean operator identity instead of
 * dumping the raw machine string).
 *
 * Relay operators put a free-form `ContactInfo` line in their torrc. Many follow
 * the Tor "ContactInfo Information Sharing" convention: space-separated
 * `key:value` fields (`email:`, `url:`, `proof:`, `abuse:`, `ciissversion:`,
 * socials, crypto addresses, ...), often with the `@` in emails obfuscated as
 * `[]` / `[at]` and `.` as `[dot]` to dodge scrapers. Rendered verbatim it is an
 * unreadable multi-line blob; parsed, it is a domain + a verified badge + a
 * couple of links.
 *
 * This is deliberately tolerant: unknown or malformed input degrades to `{ raw }`
 * with whatever could be recovered, never throws.
 */

/** Known ContactInfo field keys (Tor spec + commonly seen in the wild). */
const KNOWN_KEYS = new Set([
  'email',
  'url',
  'proof',
  'ciissversion',
  'abuse',
  'twitter',
  'mastodon',
  'matrix',
  'xmpp',
  'keybase',
  'github',
  'gitlab',
  'pgp',
  'otr',
  'hoster',
  'uplinkbw',
  'memory',
  'virtualization',
  'btc',
  'xmr',
  'eth',
  'ltc',
  'zec',
  'bch',
  'dash',
  'donationurl',
  'dns-rsa',
  'sandbox',
  'offlinemasterkey',
  'signingkeylifetime',
  'hardware',
  'cpu',
  'os',
  'tls',
  'aesni',
  'autoupdate',
  'confmgmt',
  'deprecatedkeynames',
  'family',
  'sig',
]);

export interface ParsedContact {
  /** The original string, unchanged (kept for tooltips / raw view). */
  raw: string;
  /** Free-form operator name, when the contact leads with one. */
  name?: string;
  /** De-obfuscated email (`[]`/`[at]` -> `@`, `[dot]` -> `.`). */
  email?: string;
  /** Declared homepage / URL. */
  url?: string;
  /** Best display host: URL host, else email domain. The headline identity. */
  domain?: string;
  /** `proof:` method (`uri-rsa`, `dns-rsa`, `uri-familyid-ed25519`, ...). */
  proof?: string;
  /**
   * Operator cryptographically proved **domain** ownership (`proof:uri-rsa` or
   * `proof:dns-rsa`). Family-id proofs (`*-familyid-ed25519`) prove family
   * membership, not domain control, so they do NOT count as domain-verified.
   */
  verified: boolean;
  /** Abuse contact (de-obfuscated if it looks like an email). */
  abuse?: string;
  twitter?: string;
  mastodon?: string;
  /** Every parsed `key:value`, in order - drives the "N more fields" view. */
  fields: Array<{ key: string; value: string }>;
}

/** Replace the common `@`/`.` obfuscations used to dodge address scrapers. */
function deobfuscateEmail(s: string): string {
  return s
    .replace(/\[\s*at\s*\]/gi, '@')
    .replace(/\[\s*@\s*\]/g, '@')
    .replace(/\[\]/g, '@')
    .replace(/\[\s*dot\s*\]/gi, '.')
    .replace(/\[\.\]/g, '.')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s+dot\s+/gi, '.')
    .trim();
}

/** Host portion of a URL/email/domain, without scheme, userinfo, path, or port. */
function hostOf(value: string): string | undefined {
  let v = value.trim();
  const at = v.lastIndexOf('@'); // strip email local-part or URL userinfo
  if (at >= 0) v = v.slice(at + 1);
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '');
  const host = v.split(/[/?#]/)[0]?.split(':')[0];
  return host?.includes('.') ? host.toLowerCase() : undefined;
}

export function parseContactInfo(raw: string | null | undefined): ParsedContact {
  const text = (raw ?? '').trim();
  const base: ParsedContact = { raw: text, verified: false, fields: [] };
  if (!text) return base;

  const tokens = text.split(/\s+/);
  const fields: Array<{ key: string; value: string }> = [];
  const leading: string[] = []; // free-form text before the first known key
  let sawKey = false;

  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    const key = colon > 0 ? tok.slice(0, colon).toLowerCase() : '';
    if (colon > 0 && KNOWN_KEYS.has(key)) {
      sawKey = true;
      fields.push({ key, value: tok.slice(colon + 1) });
    } else if (!sawKey) {
      leading.push(tok);
    }
    // tokens after a key that aren't themselves keys are ignored (stray/garbled)
  }

  const get = (k: string) => fields.find((f) => f.key === k)?.value;

  base.fields = fields;
  base.email = get('email') ? deobfuscateEmail(get('email') as string) : undefined;
  base.url = get('url');
  base.proof = get('proof');
  base.verified = base.proof != null && /^(uri|dns)-rsa$/i.test(base.proof);
  base.abuse = get('abuse') ? deobfuscateEmail(get('abuse') as string) : undefined;
  base.twitter = get('twitter');
  base.mastodon = get('mastodon');

  // Free-form fallback: no key:value structure (e.g. "Jane <admin at x dot org>"
  // or a bare "jane@x.org"). Recover a name + email from the loose text.
  if (!sawKey && leading.length > 0) {
    const angle = text.match(/<([^>]+)>/);
    if (angle?.[1]) {
      base.email = deobfuscateEmail(angle[1]);
      const name = text.slice(0, text.indexOf('<')).trim();
      if (name) base.name = name;
    } else {
      const emailTok = leading.find((t) => t.includes('@') || t.includes('[]'));
      if (emailTok) base.email = deobfuscateEmail(emailTok);
      const nameParts = leading.filter((t) => t !== emailTok);
      if (nameParts.length > 0 && base.email) base.name = nameParts.join(' ');
    }
  } else if (leading.length > 0) {
    // Leading text before structured keys is the operator name (e.g. "Artikel10 url:...").
    base.name = leading.join(' ');
  }

  // Drop any inline `<...>` (angle-bracket email) left in the name; collapse space.
  if (base.name) {
    const cleaned = base.name
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    base.name = cleaned || undefined;
  }

  base.domain = (base.url && hostOf(base.url)) || (base.email && hostOf(base.email)) || undefined;

  return base;
}
