'use client';

import { createRule } from '@/app/(operator)/operator/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';

const TEMPLATES = [
  {
    label: 'Anomaly ≥ medium',
    json: '{"type":"anomaly","severityMin":"medium"}',
  },
  {
    label: 'Country HHI > 1500',
    json: '{"type":"hhi_threshold","dimension":"country","op":">","value":1500}',
  },
  {
    label: 'Country guard > 30%',
    json: '{"type":"concentration_share","dimension":"country","role":"guard","op":">","value":30}',
  },
  {
    label: 'Country exit > 30%',
    json: '{"type":"concentration_share","dimension":"country","role":"exit","op":">","value":30}',
  },
];

export function RuleForm() {
  const [name, setName] = useState('');
  const [condition, setCondition] = useState(TEMPLATES[0]?.json ?? '');
  const [channels, setChannels] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createRule(formData);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">New alert rule</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="e.g. DE guard dominance"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="condition">Condition (JSON)</Label>
            <textarea
              id="condition"
              name="condition"
              required
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setCondition(t.json)}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="channels">Channels (optional)</Label>
            <Input
              id="channels"
              name="channels"
              placeholder="webhook:https://…, email:you@…, telegram:123"
              value={channels}
              onChange={(e) => setChannels(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Prefix with <code>webhook:</code>, <code>email:</code>, or{' '}
              <code>telegram:</code>.
            </p>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? 'Creating…' : 'Create rule'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
