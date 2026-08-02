'use client';

import { signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.push('/dashboard');
        router.refresh();
      }}
      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      Sign out
    </button>
  );
}
