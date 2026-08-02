import { evaluateAlertRules } from '@tor-sockets/analysis';
import { getDb } from '@tor-sockets/db';
import { getInstanceIdentity } from './instance';
import { runAlertEvaluation } from './jobs/alert-evaluate';
import { ensureDefaultAlertRules } from './jobs/seed-alert-rules';

/**
 * One-shot smoke test: seed default alert rules, evaluate them against the
 * current data, materialize events, and print what fired.
 *
 * Usage: `bun run src/smoke-alerts.ts`
 */
async function main() {
  const db = getDb(process.env.DATABASE_URL);
  const identity = await getInstanceIdentity();
  console.log('[smoke] instance:', identity.keypair.instanceId);

  console.log('[smoke] seeding default rules...');
  const seed = await ensureDefaultAlertRules(db);
  console.log('[smoke] seed:', JSON.stringify(seed));

  console.log('[smoke] evaluating rules (dry: specs only)...');
  const specs = await evaluateAlertRules(db);
  console.log('[smoke] specs:', specs.length);
  for (const s of specs.slice(0, 12)) {
    console.log(
      `  [${s.severity}] ${s.ruleName} - ${s.title} (source=${s.sourceId.slice(0, 24)} ch=${s.channels.length})`,
    );
  }

  console.log('[smoke] materializing + delivering...');
  const result = await runAlertEvaluation(db, { instance: identity.keypair });
  console.log('[smoke] result:', JSON.stringify(result, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});
