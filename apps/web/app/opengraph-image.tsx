import { ImageResponse } from 'next/og';

/**
 * Dynamic Open Graph image for the landing (1200×630). Renders the circuit mark
 * and the brand question on the amethyst surface. Hex literals only - OG routes
 * render outside the CSS context, matching app/icon.svg.
 */
export const alt = 'Tor-Sockets - who controls your circuit?';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#160a28',
        padding: '72px',
        fontFamily: 'sans-serif',
        color: '#f4f1fa',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#5b9bd5' }} />
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#9aa0aa' }} />
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#e8b15e' }} />
        </div>
        <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>
          tor<span style={{ color: '#a99fc4' }}>.sockets</span>
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          Who controls your circuit?
        </div>
        <div style={{ fontSize: 30, color: '#c3bbd8', maxWidth: 900 }}>
          Federated Tor network concentration &amp; health monitor.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: 24 }}>
        <span style={{ color: '#9c5fd6', fontWeight: 600 }}>HHI · anomalies · federation</span>
        <span style={{ color: '#6f6790' }}>- derived from the signed Tor consensus.</span>
      </div>
    </div>,
    size,
  );
}
