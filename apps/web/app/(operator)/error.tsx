'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

export default function OperatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="size-8 text-sev-high" />
      <div className="space-y-1">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          The operator panel could not be loaded
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your session is untouched. Retry, or sign in again if this keeps happening.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground/60">ref {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Try again
      </Button>
    </div>
  );
}
