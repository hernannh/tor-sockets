import { LandingHeader } from '@/components/landing/landing-header';
import { SiteFooter } from '@/components/landing/site-footer';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LandingHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
