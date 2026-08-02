import { ClaimsPanel } from '@/components/operator/claims-panel';
import { PeerPanel } from '@/components/operator/peer-panel';
import { RuleForm } from '@/components/operator/rule-form';
import { RuleList } from '@/components/operator/rule-list';
import { SignOutButton } from '@/components/operator/sign-out-button';
import { TwoFactorPanel } from '@/components/operator/two-factor-panel';
import { PageHeader, SectionHeading } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAllRules, getClaimsByOperator, getPeers, getRulesByOwner } from '@/lib/api/queries';
import { getSession } from '@/lib/auth';
import { getDb, operators } from '@tor-sockets/db';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Operator',
  // Session-gated console: crawlable by link, never indexed.
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

export default async function OperatorPage() {
  const session = await getSession();
  const user = session?.user;
  if (!user) return null;
  const db = getDb(process.env.DATABASE_URL);

  const [ownRules, allRules, claims, peers, operatorRow] = await Promise.all([
    getRulesByOwner(db, user.id),
    getAllRules(db),
    getClaimsByOperator(db, user.id),
    getPeers(db),
    db
      .select({ verifyToken: operators.verifyToken })
      .from(operators)
      .where(eq(operators.id, user.id))
      .limit(1),
  ]);

  const systemRules = allRules.filter((r) => r.ownerId !== user.id);
  const hasToken = Boolean(operatorRow[0]?.verifyToken);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operator"
        description={
          <>
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
            {user.displayName ? ` (${user.displayName})` : ''}
          </>
        }
        aside={<SignOutButton />}
      />

      <TwoFactorPanel />

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">
            Alert rules
            <Count n={ownRules.length} />
          </TabsTrigger>
          <TabsTrigger value="claims">
            Relay claims
            <Count n={claims.length} />
          </TabsTrigger>
          <TabsTrigger value="peers">
            Federation peers
            <Count n={peers.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <RuleForm />
            <RuleList rules={ownRules} />
          </div>
          {systemRules.length > 0 ? (
            <div>
              <SectionHeading className="mb-2">
                System defaults ({systemRules.length})
              </SectionHeading>
              <RuleList rules={systemRules} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="claims" className="mt-4">
          <ClaimsPanel claims={claims} hasToken={hasToken} />
        </TabsContent>

        <TabsContent value="peers" className="mt-4">
          <PeerPanel peers={peers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
      {n}
    </span>
  );
}
