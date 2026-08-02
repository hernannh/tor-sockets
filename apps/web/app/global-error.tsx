'use client';

/**
 * Top-level error boundary. Replaces the whole document (including the root
 * layout) when rendering fails above the route level, so it must render its own
 * <html>/<body>.
 *
 * It also pins down the `/_global-error` prerender: without an explicit file
 * Next builds its own default variant, whose prerender fails in this app
 * ("Cannot read properties of null (reading 'useContext')") and breaks
 * `next build` entirely. Keep this component dependency-free - no providers, no
 * fonts, no UI kit - since it renders exactly when the normal tree is broken.
 */
export default function GlobalError({
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#040f15',
          color: '#f4fbfc',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <main style={{ textAlign: 'center', padding: '2rem', maxWidth: '32rem' }}>
          <p style={{ color: '#3bcfcf', letterSpacing: '0.2em', fontSize: 12, margin: 0 }}>
            TOR-SOCKETS
          </p>
          <h1 style={{ fontSize: 28, margin: '0.75rem 0' }}>Something broke on our side</h1>
          <p style={{ color: '#7c8a91', lineHeight: 1.6 }}>
            The page could not be rendered. The incident is logged; the data pipeline itself is
            unaffected.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.6rem 1.2rem',
              borderRadius: 8,
              border: '1px solid #3bcfcf',
              background: 'transparent',
              color: '#3bcfcf',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
