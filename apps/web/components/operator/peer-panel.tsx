'use client';

import {
  addPeerAction,
  removePeerAction,
  togglePeerTrusted,
} from '@/app/(operator)/operator/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { PeerView } from '@/lib/api/queries';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Globe, Loader2, Trash2 } from 'lucide-react';
import { type ReactNode, useState, useTransition } from 'react';

function shortHash(hash: string | null | undefined, head = 10): string {
  if (!hash) return '-';
  return hash.length > head + 6 ? `${hash.slice(0, head)}…${hash.slice(-4)}` : hash;
}

function Feedback({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <Alert
      variant={ok ? 'default' : 'destructive'}
      className={ok ? 'border-success/30 bg-success/10 text-success' : ''}
    >
      {ok ? <CheckCircle2 /> : <AlertCircle />}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function PeerPanel({ peers }: { peers: PeerView[] }) {
  const [uri, setUri] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Federation peers ({peers.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Add a peer by its public URI. The actor document is fetched and the published instance_id
          + pubkey are recorded. New peers are untrusted - enable cross-verification manually after
          reviewing.
        </p>

        <form
          action={(fd) => {
            setMsg(null);
            start(async () => {
              const res = await addPeerAction(fd);
              setMsg(
                'error' in res
                  ? { ok: false, text: res.error ?? 'add failed' }
                  : { ok: true, text: `Added ${shortHash(res.instanceId, 12)}` },
              );
              setUri('');
            });
          }}
          className="flex gap-2"
        >
          <Input
            name="uri"
            placeholder="https://peer.example.com"
            required
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            className="text-xs"
          />
          <Button type="submit" disabled={pending} variant="outline">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Add peer
          </Button>
        </form>
        {msg ? <Feedback ok={msg.ok}>{msg.text}</Feedback> : null}

        {peers.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No peers yet.</p>
        ) : (
          <div className="space-y-2">
            {peers.map((p) => (
              <PeerRow key={p.instanceId} peer={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeerRow({ peer }: { peer: PeerView }) {
  const [, start] = useTransition();
  const status = peer.lastStatus;
  const matchesOwn = typeof status?.matches_own === 'boolean' ? status.matches_own : null;
  const divergent = matchesOwn === false;
  const borderCls = peer.trusted
    ? divergent
      ? 'border-peer-divergent/30'
      : 'border-peer-trusted/30'
    : 'border-border/60';
  const accentCls = peer.trusted
    ? divergent
      ? 'bg-peer-divergent'
      : 'bg-peer-trusted'
    : 'bg-status-stopped';

  return (
    <div
      className={cn(
        'relative space-y-1 overflow-hidden rounded-lg border bg-card/40 py-2 pr-3 pl-4 text-sm',
        borderCls,
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-[2.5px]', accentCls)} aria-hidden="true" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => start(() => togglePeerTrusted(peer.instanceId, !peer.trusted))}
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
            peer.trusted
              ? 'bg-peer-trusted/15 text-peer-trusted hover:bg-peer-trusted/25'
              : 'bg-status-stopped/15 text-status-stopped hover:bg-status-stopped/25',
          )}
          title={peer.trusted ? 'Trusted - click to untrust' : 'Untrusted - click to trust'}
        >
          {peer.trusted ? 'trusted' : 'untrusted'}
        </button>
        <a
          href={`${peer.uri}/.well-known/tor-federation.json`}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium hover:text-primary"
        >
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{peer.uri}</span>
        </a>
        <button
          type="button"
          onClick={() => start(() => removePeerAction(peer.instanceId))}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          title="Remove peer"
          aria-label="Remove peer"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 font-mono text-xs text-muted-foreground">
        <span>{shortHash(peer.instanceId, 16)}</span>
        {peer.lastSeenAt ? (
          <span className="font-sans">seen {formatRelative(peer.lastSeenAt)}</span>
        ) : null}
        {peer.lastStatus ? (
          <Badge
            variant="outline"
            className={
              matchesOwn === null
                ? 'border-status-stopped/30 text-status-stopped'
                : matchesOwn
                  ? 'border-peer-trusted/30 text-peer-trusted'
                  : 'border-peer-divergent/30 text-peer-divergent'
            }
          >
            {matchesOwn === null ? 'no sync' : matchesOwn ? 'hash matches' : 'DIVERGENT'}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
