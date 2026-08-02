'use client';

import { deleteRule, toggleRule } from '@/app/(operator)/operator/actions';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AlertRule } from '@tor-sockets/db';
import { Loader2, Trash2 } from 'lucide-react';
import { useTransition } from 'react';

const CONDITION_LABEL: Record<string, string> = {
  anomaly: 'Anomaly',
  hhi_threshold: 'HHI threshold',
  concentration_share: 'Concentration share',
};

export function RuleList({ rules }: { rules: AlertRule[] }) {
  if (rules.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No rules yet. Create one above, or rely on the system defaults.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Your alert rules ({rules.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rules.map((r) => (
          <RuleRow key={r.id} rule={r} />
        ))}
      </CardContent>
    </Card>
  );
}

function RuleRow({ rule }: { rule: AlertRule }) {
  const [pending, start] = useTransition();
  const cond = rule.condition as { type?: string };
  const channels = rule.channels ?? [];

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 overflow-hidden rounded-lg border bg-card/40 py-2.5 pr-2 pl-4',
        rule.enabled ? 'border-primary/25' : 'border-border/60',
      )}
    >
      {rule.enabled ? (
        <span className="absolute inset-y-0 left-0 w-[2.5px] bg-primary" aria-hidden="true" />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{rule.name}</p>
          {cond?.type ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {CONDITION_LABEL[cond.type] ?? cond.type}
            </Badge>
          ) : null}
          {!rule.enabled ? (
            <span className="text-[10px] font-medium text-muted-foreground">disabled</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {channels.length} channel{channels.length === 1 ? '' : 's'} · created{' '}
          {formatRelative(rule.createdAt.toISOString())}
        </p>
        {channels.length > 0 ? (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
            {channels.join(' · ')}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => toggleRule(rule.id, !rule.enabled))}
        className={cn(
          'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
          rule.enabled
            ? 'bg-status-running/15 text-status-running hover:bg-status-running/25'
            : 'bg-status-stopped/15 text-status-stopped hover:bg-status-stopped/25',
        )}
        title={rule.enabled ? 'enabled - click to disable' : 'disabled - click to enable'}
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : rule.enabled ? 'on' : 'off'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => deleteRule(rule.id))}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
        title="Delete rule"
        aria-label="Delete rule"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
