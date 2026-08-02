import { afterEach, describe, expect, it, vi } from 'vitest';
import { SafeFetchError, assertUrlSafe, isBlockedAddress } from './safe-fetch';

afterEach(() => {
  vi.unstubAllEnvs();
});

function rejects(url: string) {
  return () => assertUrlSafe(url);
}

describe('isBlockedAddress', () => {
  it('blocks loopback, RFC1918, CGNAT, link-local and cloud metadata', () => {
    for (const ip of [
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '10.0.0.7',
      '172.16.5.5',
      '172.31.255.254',
      '192.168.1.1',
      '100.64.0.1',
      '169.254.169.254', // AWS/GCP metadata
      '224.0.0.1',
      '255.255.255.255',
      '198.18.0.1',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '171.25.193.9', '2606:4700:4700::1111']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it('blocks IPv6 loopback/ULA/link-local, bracketed or not', () => {
    for (const ip of ['::1', '[::1]', '::', 'fd00::1', 'fc00::1', 'fe80::1', 'fe80::1%eth0']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('blocks IPv4-mapped IPv6 in both dotted and hex spellings (regression: bracketed bypass)', () => {
    for (const ip of [
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      '::ffff:7f00:1', // 127.0.0.1
      '::ffff:a9fe:a9fe', // 169.254.169.254 - what new URL() produces
      '[::ffff:a9fe:a9fe]',
      '64:ff9b::a9fe:a9fe', // NAT64 to the metadata IP
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('fails closed on garbage', () => {
    for (const ip of ['', 'not-an-ip', '999.1.1.1', '   ']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });
});

describe('assertUrlSafe', () => {
  it('accepts a plain https peer URL', () => {
    const target = assertUrlSafe('https://peer.example.org/.well-known/tor-federation.json');
    expect(target.host).toBe('peer.example.org');
    expect(target.port).toBe(443);
    expect(target.isTls).toBe(true);
  });

  it('rejects bracketed IPv6 literals that point at loopback or metadata', () => {
    // Regression: URL.hostname keeps the brackets, so a naive IP regex misses
    // these and the request reaches the internal address.
    expect(rejects('http://[::1]/')).toThrow(SafeFetchError);
    expect(rejects('http://[::ffff:169.254.169.254]/latest/meta-data/')).toThrow(SafeFetchError);
    expect(rejects('http://[fd00::1]:80/')).toThrow(SafeFetchError);
  });

  it('rejects decimal and octal spellings of loopback', () => {
    expect(rejects('http://2130706433/')).toThrow(SafeFetchError);
    expect(rejects('http://0177.0.0.1/')).toThrow(SafeFetchError);
  });

  it('rejects localhost names and private literals', () => {
    expect(rejects('http://localhost:3000/')).toThrow(SafeFetchError);
    expect(rejects('http://foo.localhost/')).toThrow(SafeFetchError);
    expect(rejects('http://printer.local/')).toThrow(SafeFetchError);
    expect(rejects('http://169.254.169.254/latest/meta-data/')).toThrow(SafeFetchError);
  });

  it('rejects non-http schemes', () => {
    for (const url of [
      'file:///etc/passwd',
      'gopher://x.test/',
      'ftp://x.test/',
      'data:text/html,',
    ]) {
      expect(rejects(url), url).toThrow(SafeFetchError);
    }
  });

  it('rejects credentials embedded in the URL', () => {
    expect(rejects('https://user:pass@peer.example.org/')).toThrow(SafeFetchError);
  });

  it('rejects ports outside the allowlist', () => {
    expect(rejects('https://peer.example.org:6379/')).toThrow(SafeFetchError); // redis
    expect(rejects('https://peer.example.org:22/')).toThrow(SafeFetchError); // ssh
  });

  it('allows extra ports only when explicitly configured', () => {
    expect(rejects('https://peer.example.org:8443/')).toThrow(SafeFetchError);
    vi.stubEnv('FEDERATION_ALLOWED_PORTS', '8443');
    expect(assertUrlSafe('https://peer.example.org:8443/').port).toBe(8443);
  });

  it('refuses plain http in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(rejects('http://peer.example.org/')).toThrow(SafeFetchError);
    expect(assertUrlSafe('https://peer.example.org/').isTls).toBe(true);
  });

  it('ignores the local-peering escape hatch in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFE_FETCH_ALLOW_PRIVATE', 'true');
    expect(rejects('http://127.0.0.1:3001/')).toThrow(SafeFetchError);
  });

  it('honours the escape hatch outside production (local peering)', () => {
    // NODE_ENV is stubbed rather than inherited from the environment: the
    // .env.example template ships NODE_ENV=production deliberately, so a
    // developer who copied it and exported it would see this test fail for a
    // reason that is not a defect in the code under test.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SAFE_FETCH_ALLOW_PRIVATE', 'true');
    expect(assertUrlSafe('http://127.0.0.1:3001/').host).toBe('127.0.0.1');
  });
});
