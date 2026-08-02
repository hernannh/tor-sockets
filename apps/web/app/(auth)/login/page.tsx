'use client';

import { EmailField, PasswordInput } from '@/components/auth/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn, twoFactor } from '@/lib/auth-client';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

/**
 * `useSearchParams` opts the whole subtree into client-side rendering, so Next
 * refuses to prerender the page unless it sits under a Suspense boundary
 * ("missing-suspense-with-csr-bailout" - it fails the production build, not just
 * dev). The form lives in LoginForm; the default export only provides the
 * boundary.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callback = params.get('callbackUrl') ?? '/operator';
  const justVerified = params.get('verified') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? 'Sign in failed');
      return;
    }
    // better-auth returns { token, user } on a successful sign-in. When the
    // account has 2FA enabled it returns NO token (the session is held until the
    // TOTP is verified) - that is the 2FA challenge.
    if (res.data?.token) {
      router.push(callback);
      router.refresh();
      return;
    }
    setNeeds2fa(true);
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await twoFactor.verifyTotp({ code });
    setLoading(false);
    if (err) {
      setError(err.message ?? 'Invalid code');
      return;
    }
    router.push(callback);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Operator sign in</CardTitle>
        <CardDescription>
          {needs2fa
            ? 'Enter the code from your authenticator.'
            : 'Manage relays, claims, and alert rules.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {needs2fa ? (
          <form onSubmit={onTotpSubmit} className="space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" />
              Two-factor authentication required for this account.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Authentication code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={loading || code.length < 6} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {loading ? 'Verifying…' : 'Verify & sign in'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setNeeds2fa(false);
                setCode('');
                setError(null);
              }}
              className="w-full text-center text-xs text-muted-foreground hover:underline"
            >
              ← Back
            </button>
          </form>
        ) : (
          <form onSubmit={onPasswordSubmit} className="space-y-4">
            {justVerified ? (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertDescription>Email verified - you can sign in now.</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <EmailField
                id="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No account?{' '}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
