import { BrandPanel } from '@/components/auth/brand-panel';
import { getStats } from '@/lib/api/queries';
import { getDb } from '@tor-sockets/db';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  let stats: Awaited<ReturnType<typeof getStats>> | null = null;
  try {
    stats = await getStats(getDb(process.env.DATABASE_URL));
  } catch {
    stats = null;
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel stats={stats} />
      <div className="flex items-center justify-center px-6 py-12">{children}</div>
    </main>
  );
}
