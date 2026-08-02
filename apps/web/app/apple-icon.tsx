import { ImageResponse } from 'next/og';

/**
 * Apple touch icon (180×180) - the 3-hop circuit mark on the amethyst brand
 * surface. Rendered dynamically via next/og so no binary is committed. Colours
 * mirror app/icon.svg (hex, since image routes render outside the CSS context).
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';
export const alt = 'Tor-Sockets - federated Tor network health & concentration monitor';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#9c5fd6',
        borderRadius: 38,
        fontSize: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#5b9bd5' }} />
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#9aa0aa' }} />
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8b15e' }} />
      </div>
    </div>,
    size,
  );
}
