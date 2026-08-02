'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Lock, type LucideIcon, Mail, User } from 'lucide-react';
import { type ReactNode, useState } from 'react';

/** Input with a leading icon, vertically centered. */
function IconInput({
  icon: Icon,
  className,
  ...props
}: { icon: LucideIcon } & React.ComponentProps<'input'>) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn('pl-9', className)} {...props} />
    </div>
  );
}

export function EmailField(props: React.ComponentProps<'input'>) {
  return <IconInput icon={Mail} type="email" inputMode="email" autoComplete="email" {...props} />;
}

export function NameField(props: React.ComponentProps<'input'>) {
  return <IconInput icon={User} autoComplete="name" {...props} />;
}

type Strength = { score: 0 | 1 | 2 | 3; label: string };

function scorePassword(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['too short', 'weak', 'fair', 'strong'];
  return { score: score as Strength['score'], label: labels[score] };
}

const STRENGTH_BAR = ['bg-muted', 'bg-sev-critical', 'bg-sev-medium', 'bg-sev-low'];
const STRENGTH_TEXT = [
  'text-muted-foreground',
  'text-sev-critical',
  'text-sev-medium',
  'text-sev-low',
];

function StrengthMeter({ strength }: { strength: Strength }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < strength.score ? STRENGTH_BAR[strength.score] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <span className={cn('text-xs font-medium', STRENGTH_TEXT[strength.score])}>
        {strength.label}
      </span>
    </div>
  );
}

export function PasswordInput({
  withStrength = false,
  value,
  className,
  children,
  ...props
}: { withStrength?: boolean } & React.ComponentProps<'input'>) {
  const [show, setShow] = useState(false);
  const pw = String(value ?? '');
  const strength = withStrength && pw.length > 0 ? scorePassword(pw) : null;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          className={cn('pr-9 pl-9', className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {strength ? <StrengthMeter strength={strength} /> : null}
      {children as ReactNode}
    </div>
  );
}
