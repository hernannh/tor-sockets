import type { ZodIssue, ZodTypeAny, z } from 'zod';

/**
 * Parse a zod schema against Next.js search params.
 * Returns `{ data }` on success or `{ error }` (400-ready Response) on failure.
 *
 * `searchParams.values()` flattens repeated keys into arrays, which zod
 * handles for array-typed fields. Scalar fields come through as strings and
 * must be coerced (use `z.coerce.*` in the schema).
 */
export function parseQuery<T extends ZodTypeAny>(
  schema: T,
  params: URLSearchParams,
): { success: true; data: z.infer<T> } | { success: false; response: Response } {
  const obj: Record<string, string | string[]> = {};
  for (const [key, value] of params.entries()) {
    const existing = obj[key];
    if (existing === undefined) {
      obj[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      obj[key] = [existing, value];
    }
  }
  const result = schema.safeParse(obj);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    response: Response.json(
      {
        error: {
          code: 'invalid_query',
          message: result.error.issues
            .map((i: ZodIssue) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        },
      },
      { status: 400 },
    ),
  };
}

export function notFound(message = 'resource not found'): Response {
  return Response.json({ error: { code: 'not_found', message } }, { status: 404 });
}

/** JSON response with short public cache - data changes at most hourly. */
export function jsonResponse(body: unknown, maxAge = 60): Response {
  return Response.json(body, { headers: { 'cache-control': `public, max-age=${maxAge}` } });
}

/**
 * Serialize a CSV field: neutralize spreadsheet formula injection, then quote
 * per RFC 4180. Fields beginning with =, +, -, @, or a control char are treated
 * as formulas by Excel/Sheets - relay contact strings are attacker-controlled
 * (via Onionoo), so a contact like `=cmd|...` could execute when a researcher
 * opens the export. Prefix those with a single quote to defuse them.
 */
export function csvField(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV download for researchers consuming the concentration/security data.
 * `rows` are plain objects; the header is the union of `columns` (in order).
 */
export function csvResponse(
  filename: string,
  columns: string[],
  rows: Record<string, unknown>[],
  maxAge = 60,
): Response {
  const lines = [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => csvField(r[c])).join(',')),
  ];
  return new Response(`${lines.join('\n')}\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': `public, max-age=${maxAge}`,
    },
  });
}
