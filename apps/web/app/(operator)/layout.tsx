import { AppShell } from '@/components/app-shell';
import { ConsensusStatus } from '@/components/consensus-status';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/login?callbackUrl=/operator');
  }
  return (
    <AppShell consensus={<ConsensusStatus />}>
      <div className="mx-auto max-w-5xl">{children}</div>
    </AppShell>
  );
}
