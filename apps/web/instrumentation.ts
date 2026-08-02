/**
 * Next.js instrumentation hook - boots OpenTelemetry on the Node.js runtime
 * before any route handler or RSC runs.
 *
 * Env-gated: a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so normal dev
 * (no collector) pays zero overhead. Point it at the Jaeger collector from
 * docker/compose.yml (http://localhost:4318 from the host) to see traces in
 * the Jaeger UI (http://localhost:16686).
 *
 * `registerOTel` wires auto-instrumentations (HTTP in/out, fs, and - once the
 * pg client loads - Postgres queries) so the read-heavy SSR → DB path is traced
 * end-to-end with no manual spans.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  const { registerOTel } = await import('@vercel/otel');
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'tor-sockets-web' });
}
