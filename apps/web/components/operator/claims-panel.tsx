'use client';

import {
  claimSelfAttestedRelay,
  deleteClaim,
  generateVerifyToken,
  getT2Challenge,
  runContactVerification,
  submitT2Claim,
} from '@/app/(operator)/operator/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ClaimView } from '@/lib/api/queries';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  AtSign,
  CheckCircle2,
  Loader2,
  type LucideIcon,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState, useTransition } from 'react';

const PROOF_META: Record<string, { solid: string; text: string; icon: LucideIcon; label: string }> =
  {
    contact_token: {
      solid: 'bg-proof-contact',
      text: 'text-proof-contact',
      icon: AtSign,
      label: 'Contact token',
    },
    ed25519_master_key: {
      solid: 'bg-proof-ed25519',
      text: 'text-proof-ed25519',
      icon: ShieldCheck,
      label: 'Ed25519',
    },
    self_attested: {
      solid: 'bg-proof-self',
      text: 'text-proof-self',
      icon: UserCheck,
      label: 'Self-attested',
    },
  };

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

export function ClaimsPanel({
  claims,
  hasToken,
}: {
  claims: ClaimView[];
  hasToken: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AtSign className="size-4 text-proof-contact" />
            Verify relay ownership · T1 contact token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Generate a token, paste it into your relay&apos;s <code>Contact</code> field in{' '}
            <code>torrc</code>, reload, and wait for the next hourly Onionoo poll. Then click
            &quot;Verify now&quot;.
          </p>

          {token ? (
            <div className="rounded-md border border-proof-contact/30 bg-proof-contact/5 p-3">
              <p className="text-xs text-muted-foreground">Add this to your torrc Contact:</p>
              <code className="mt-1 block break-all font-mono text-xs text-proof-contact">
                {token}
              </code>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await generateVerifyToken();
                  setToken(res.token);
                  setVerifyResult(null);
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {hasToken ? 'Rotate token' : 'Generate verify token'}
            </Button>
            <Button
              type="button"
              disabled={pending || !hasToken}
              onClick={() =>
                start(async () => {
                  const res = await runContactVerification();
                  setVerifyResult(
                    res.token
                      ? `matched ${res.matched} relay(s), ${res.created} new claim(s)`
                      : 'no token set',
                  );
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Verify now
            </Button>
            {verifyResult ? <Feedback ok>{verifyResult}</Feedback> : null}
          </div>
        </CardContent>
      </Card>

      <Ed25519ClaimCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <UserCheck className="size-4 text-proof-self" />
            Self-attested claim · T3 low trust
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SelfAttestedForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Verified claims ({claims.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No claims yet.</p>
          ) : (
            <div className="space-y-2">
              {claims.map((c) => (
                <ClaimRow key={c.id} claim={c} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SelfAttestedForm() {
  const [fingerprint, setFingerprint] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => {
        setMsg(null);
        start(async () => {
          const res = await claimSelfAttestedRelay(fd);
          setMsg(
            'error' in res
              ? { ok: false, text: res.error ?? 'claim failed' }
              : { ok: true, text: res.created ? 'Claim created' : 'Already claimed' },
          );
          setFingerprint('');
        });
      }}
      className="space-y-3 text-sm"
    >
      <p className="text-muted-foreground">
        Instant claim if your account email appears in the relay&apos;s contact field. Marked
        low-trust.
      </p>
      <div className="flex gap-2">
        <Input
          name="fingerprint"
          placeholder="40-char hex fingerprint"
          required
          value={fingerprint}
          onChange={(e) => setFingerprint(e.target.value)}
          className="font-mono text-xs"
        />
        <Button type="submit" disabled={pending} variant="outline">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Claim
        </Button>
      </div>
      {msg ? <Feedback ok={msg.ok}>{msg.text}</Feedback> : null}
    </form>
  );
}

function ClaimRow({ claim }: { claim: ClaimView }) {
  const [, start] = useTransition();
  const meta = PROOF_META[claim.proofType] ?? {
    solid: 'bg-muted',
    text: 'text-muted-foreground',
    icon: ShieldCheck,
    label: claim.proofType,
  };
  const Icon = meta.icon;
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-border/60 bg-card/40 py-2 pr-2 pl-4">
      <span className={cn('absolute inset-y-0 left-0 w-[2.5px]', meta.solid)} aria-hidden="true" />
      <Icon className={cn('size-4 shrink-0', meta.text)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/relays/${claim.fingerprint}`}
            className="truncate text-sm font-medium hover:text-primary"
          >
            {claim.nickname ?? claim.fingerprint.slice(0, 12)}
          </Link>
          <span className="text-[10px] text-muted-foreground">{meta.label}</span>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {claim.fingerprint.slice(0, 16)}…
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatRelative(claim.verifiedAt)}
      </span>
      <button
        type="button"
        onClick={() => start(() => deleteClaim(claim.id))}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
        title="Revoke claim"
        aria-label="Revoke claim"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function Ed25519ClaimCard() {
  const [fingerprint, setFingerprint] = useState('');
  const [command, setCommand] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-proof-ed25519" />
          Verify relay ownership · T2 Ed25519 (strongest)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Cryptographic proof: run our CLI on the relay host. It reads the master identity key
          locally and signs a proof - the key never leaves the host. The signature is verified
          against the relay&apos;s published <code>master-key-ed25519</code>.
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="40-char hex fingerprint"
            value={fingerprint}
            onChange={(e) => setFingerprint(e.target.value)}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || fingerprint.length === 0}
            onClick={() =>
              start(async () => {
                const res = await getT2Challenge(fingerprint);
                setCommand('error' in res ? null : res.command);
                setResult('error' in res ? { ok: false, text: res.error ?? 'invalid' } : null);
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Generate command
          </Button>
        </div>

        {command ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Run on the relay host:</p>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              {command}
            </pre>
            <p className="text-xs text-muted-foreground">
              Paste the printed base64 signature below:
            </p>
          </div>
        ) : null}

        {command ? (
          <div className="flex gap-2">
            <Input
              placeholder="base64 signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              disabled={pending || !signature.trim()}
              onClick={() =>
                start(async () => {
                  const res = await submitT2Claim(fingerprint, signature);
                  setResult(
                    'error' in res
                      ? { ok: false, text: res.error ?? 'verification failed' }
                      : { ok: true, text: 'Cryptographically verified ✓' },
                  );
                  if (!('error' in res)) {
                    setSignature('');
                    setCommand(null);
                  }
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Verify signature
            </Button>
          </div>
        ) : null}

        {result ? <Feedback ok={result.ok}>{result.text}</Feedback> : null}
      </CardContent>
    </Card>
  );
}
