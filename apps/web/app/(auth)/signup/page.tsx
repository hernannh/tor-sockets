'use client';

import { EmailField, NameField, PasswordInput } from '@/components/auth/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth-client';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const { error: err } = await signUp.email({
      email,
      password,
      name,
      // Land on the login page with a verified flag after the email is confirmed.
      callbackURL: '/login?verified=1',
    });
    setLoading(false);
    if (err) {
      setError(err.message ?? 'Sign up failed');
      return;
    }
    // The account is created but NOT signed in (email verification is required).
    // Show a confirmation instead of redirecting to /operator (which would just
    // bounce back to /login).
    setDone(true);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Create operator account</CardTitle>
        <CardDescription>Verify relays, claim ownership, and receive alerts.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription className="space-y-2">
              <p>
                Account created for <strong>{email}</strong>.
              </p>
              <p>
                We sent a verification link to your email. Open it to activate the account, then
                sign in.
              </p>
              {/* No developer instructions here. This card is what every visitor
                  sees after signing up on a public instance; a note about
                  DEV_LOG_VERIFICATION and `pnpm dev` told them to go read a
                  server console they have no access to. Someone running this
                  locally already has that console in front of them. */}
              <p className="text-xs text-muted-foreground">
                Nothing after a few minutes? Check your spam folder.
              </p>
              <Link href="/login" className="block pt-1 font-medium text-primary hover:underline">
                Go to sign in →
              </Link>
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Display name</Label>
              <NameField
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
                autoComplete="new-password"
                placeholder="At least 8 characters"
                withStrength
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <PasswordInput
                id="confirm"
                required
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {loading ? 'Creating…' : 'Create account'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
