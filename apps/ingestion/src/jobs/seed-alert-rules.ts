import type { AlertCondition } from '@tor-sockets/api-contract';
import { type Database, alertRules, operators } from '@tor-sockets/db';
import { eq } from 'drizzle-orm';

/**
 * Self-bootstrap default alert rules on first run so the engine has work to do
 * immediately (before operator auth/UI exists in Fase 3.2).
 *
 * Creates a 'system' operator (idempotent) and a small set of sensible
 * defaults if no rules exist. Channels are seeded from env so a single
 * configuration block wires all defaults:
 *   ALERT_WEBHOOK_URL, ALERT_EMAIL, ALERT_TELEGRAM_CHAT
 */

const SYSTEM_OPERATOR_EMAIL = 'system@tor-sockets.local';

const DEFAULT_RULES: Array<{ name: string; condition: AlertCondition }> = [
  {
    name: 'Notable anomaly detected',
    condition: { type: 'anomaly', severityMin: 'medium' },
  },
  {
    name: 'Country HHI above 1000',
    condition: { type: 'hhi_threshold', dimension: 'country', op: '>', value: 1000 },
  },
  {
    name: 'Country guard share > 25%',
    condition: {
      type: 'concentration_share',
      dimension: 'country',
      role: 'guard',
      op: '>',
      value: 25,
    },
  },
  {
    name: 'Country exit share > 25%',
    condition: {
      type: 'concentration_share',
      dimension: 'country',
      role: 'exit',
      op: '>',
      value: 25,
    },
  },
];

export interface SeedResult {
  operatorId: string;
  rulesCreated: number;
  rulesTotal: number;
}

export async function ensureDefaultAlertRules(db: Database): Promise<SeedResult> {
  const operatorId = await ensureSystemOperator(db);

  const existing = await db.select({ id: alertRules.id }).from(alertRules).limit(1);
  if (existing.length > 0) {
    const all = await db.select({ id: alertRules.id }).from(alertRules);
    return { operatorId, rulesCreated: 0, rulesTotal: all.length };
  }

  const channels = collectDefaultChannels();

  for (const rule of DEFAULT_RULES) {
    await db.insert(alertRules).values({
      ownerId: operatorId,
      name: rule.name,
      condition: rule.condition,
      channels,
    });
  }

  return { operatorId, rulesCreated: DEFAULT_RULES.length, rulesTotal: DEFAULT_RULES.length };
}

async function ensureSystemOperator(db: Database): Promise<string> {
  const [existing] = await db
    .select({ id: operators.id })
    .from(operators)
    .where(eq(operators.email, SYSTEM_OPERATOR_EMAIL))
    .limit(1);
  if (existing) return existing.id;

  const [row] = await db
    .insert(operators)
    .values({ email: SYSTEM_OPERATOR_EMAIL, displayName: 'System' })
    .returning({ id: operators.id });
  if (!row) throw new Error('failed to create system operator');
  return row.id;
}

function collectDefaultChannels(): string[] {
  const channels: string[] = [];
  const webhook = process.env.ALERT_WEBHOOK_URL;
  const email = process.env.ALERT_EMAIL;
  const telegram = process.env.ALERT_TELEGRAM_CHAT;
  if (webhook) channels.push(`webhook:${webhook}`);
  if (email) channels.push(`email:${email}`);
  if (telegram) channels.push(`telegram:${telegram}`);
  return channels;
}
