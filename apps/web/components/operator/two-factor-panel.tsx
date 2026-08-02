'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { twoFactor, useSession } from '@/lib/auth-client';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

type Phase = 'idle' | 'enabling' | 'verifying';

/**
 * Operator two-factor auth (TOTP) management.
 *
 * Enable flow (skipVerificationOnEnable is false on the server, so verification
 * is required before 2FA is live):
 *   1. enter password -> POST /two-factor/enable -> server returns totpURI + backupCodes
 *   2. add the account to an authenticator (scan/paste the otpauth URI)
 *   3. enter a current 6-digit code -> POST /two-factor/verify-totp -> 2FA on
 *
 * Backup codes are shown ONCE; the operator must store them. Disabling requires
 * the password (and the operator is already authenticated, so no TOTP needed).
 *
 * `qrcode` is imported dynamically only when a URI exists (verifying phase), so
 * the dep stays out of the operator bundle until 2FA setup actually starts. The
 * pending state of the three mutations comes from useTransition instead of a
 * manual loading flag.
 */
export function TwoFactorPanel() {
  const { data: session, isPending } = useSession();
  const enabled = Boolean(session?.user?.twoFactorEnabled);

  const [phase, setPhase] = useState<Phase>('idle');
  const [password, setPassword] = useState('');
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Render the otpauth URI as a scannable QR. Authenticators read it directly.
  // qrcode is loaded on demand (only during verification) via dynamic import.
  useEffect(() => {
    if (!totpUri) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(totpUri, { margin: 1, width: 240 }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [totpUri]);

  function startEnable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { data, error: err } = await twoFactor.enable({ password });
      if (err) {
        setError(err.message ?? 'Could not start 2FA setup');
        return;
      }
      setTotpUri(data?.totpURI ?? null);
      setBackupCodes(data?.backupCodes ?? null);
      setPhase('verifying');
    });
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error: err } = await twoFactor.verifyTotp({ code });
      if (err) {
        setError(err.message ?? 'Invalid code. Try again.');
        return;
      }
      setPhase('idle');
      setPassword('');
      setCode('');
      setTotpUri(null);
      setBackupCodes(null);
    });
  }

  function disable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error: err } = await twoFactor.disable({ password: disablePassword });
      if (err) {
        setError(err.message ?? 'Could not disable 2FA');
        return;
      }
      setDisablePassword('');
    });
  }

  function copyCodes() {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isPending) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="size-4" /> Two-factor authentication
        </CardTitle>
        <CardDescription>
          {enabled
            ? 'Enabled. Required to manage federation peers.'
            : 'Optional, but required to manage federation peers (add/trust peers).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled ? (
          <form onSubmit={disable} className="space-y-3">
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertDescription>2FA is active on your account.</AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <Label htmlFor="disable-pw">Password (to disable)</Label>
              <Input
                id="disable-pw"
                type="password"
                autoComplete="current-password"
                required
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </div>
            <Button type="submit" variant="destructive" disabled={pending || !disablePassword}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Disable 2FA
            </Button>
          </form>
        ) : phase === 'idle' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Add a TOTP authenticator (e.g. Authy, 1Password, Aegis) as a second factor.
            </p>
            <Button onClick={() => setPhase('enabling')}>Enable 2FA</Button>
          </div>
        ) : phase === 'enabling' ? (
          <form onSubmit={startEnable} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="enable-pw">Password</Label>
              <Input
                id="enable-pw"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || !password}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Generate secret
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPhase('idle')}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="size-4" />
              <AlertDescription>
                Scan the QR with your authenticator (or paste the URI below), then enter a current
                6-digit code. Your account is <strong>not</strong> 2FA-protected until verified.
              </AlertDescription>
            </Alert>
            {qrDataUrl ? (
              <div className="flex justify-center">
                {/* QR is generated client-side from the otpauth URI; no remote image. */}
                <img
                  src={qrDataUrl}
                  alt="2FA QR code"
                  width={200}
                  height={200}
                  className="rounded-md border bg-white p-1"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Authenticator URI (otpauth)</Label>
              <pre className="max-h-24 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-tight break-all">
                {totpUri}
              </pre>
            </div>
            {backupCodes && backupCodes.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Backup codes (store these - shown once)</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={copyCodes}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-2 font-mono text-xs">
                  {backupCodes.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <form onSubmit={verify} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending || code.length < 6}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Verify &amp; enable
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPhase('idle')}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
