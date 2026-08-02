import { headers } from 'next/headers';

/**
 * GET /api/docs
 * Interactive Swagger UI for the public REST API.
 *
 * Served as standalone HTML with SELF-HOSTED swagger-ui assets
 * (apps/web/public/swagger-ui/*) rather than the React wrapper - avoids the
 * apidom `refract is not a function` bundle bug that affects swagger-ui-react
 * under Turbopack + React 19. Self-hosting (instead of the unpkg CDN) keeps the
 * viewer under the app's own origin so the strict CSP permits it, and removes
 * the CDN/SRI supply-chain risk. The OpenAPI spec itself is at
 * `/api/v1/openapi.json`.
 *
 * Rendered per request because the bootstrap script has to carry the CSP nonce
 * minted by proxy.ts (production `script-src` no longer allows inline).
 */
export const dynamic = 'force-dynamic';

function viewerHtml(nonce: string): string {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tor-Sockets API Docs</title>
  <link rel="stylesheet" href="/swagger-ui/swagger-ui.css" />
  <style${nonceAttr}>
    body { margin: 0; }
    .topbar { display: none; }
    .tor-sockets-header {
      background: #040f15; color: #f4fbfc; padding: 16px 24px;
      font-family: ui-sans-serif, system-ui, sans-serif;
      display: flex; align-items: baseline; gap: 12px;
    }
    .tor-sockets-header h1 { font-size: 18px; font-weight: 600; margin: 0; }
    .tor-sockets-header a { color: #3bcfcf; font-size: 13px; text-decoration: none; }
    .tor-sockets-header a:hover { text-decoration: underline; }
    .tor-sockets-header .version { color: #7c8a91; font-size: 13px; }
  </style>
</head>
<body>
  <header class="tor-sockets-header">
    <h1>Tor-Sockets API</h1>
    <span class="version">v1</span>
    <a href="/api/v1/openapi.json">raw OpenAPI spec →</a>
  </header>
  <div id="swagger-ui"></div>
  <script${nonceAttr} src="/swagger-ui/swagger-ui-bundle.js" defer></script>
  <script${nonceAttr}>
    window.addEventListener('DOMContentLoaded', () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        persistAuthorization: true,
      });
    });
  </script>
</body>
</html>`;
}

export async function GET() {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return new Response(viewerHtml(nonce), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // The viewer HTML is tiny and changes with releases; never let the browser
      // serve a stale copy (a cached old HTML would keep loading retired assets).
      'cache-control': 'no-store',
    },
  });
}
