import { buildOpenApiDocument } from '@tor-sockets/api-contract';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

/**
 * GET /api/v1/openapi.json
 * OpenAPI 3.1 document for the public REST API. Generated from the zod schemas
 * in @tor-sockets/api-contract (single source of truth).
 */
export async function GET() {
  const baseUrl = process.env.TOR_SOCKETS_BASE_URL?.replace(/\/$/, '') ?? '';
  const doc = buildOpenApiDocument(baseUrl ? `${baseUrl}/api/v1` : '/api/v1');
  return Response.json(doc, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
