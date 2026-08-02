import { AppShell } from '@/components/app-shell';
import { ConsensusStatus } from '@/components/consensus-status';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell consensus={<ConsensusStatus />}>
      <div className="mx-auto max-w-7xl">{children}</div>
    </AppShell>
  );
}
