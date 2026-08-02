import {
  Activity,
  AlertTriangle,
  HeartPulse,
  LineChart,
  type LucideIcon,
  Map as MapIcon,
  Network,
  Radar,
  Search,
  ShieldAlert,
  TrendingUp,
  User,
  UserSearch,
  Users,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * The app's section map, shared by the sidebar and the command palette.
 *
 * Each label is the page's canonical name: the same string is the `<h1>`, the
 * `metadata.title` and the topbar crumb, so a page is never called two things.
 */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Network',
    items: [
      { href: '/dashboard', label: 'Overview', icon: Activity },
      { href: '/map', label: 'Relay Map', icon: MapIcon },
      { href: '/relays', label: 'Relay Directory', icon: Search },
      { href: '/network-history', label: 'Network History', icon: LineChart },
    ],
  },
  {
    label: 'Risk',
    items: [
      { href: '/families', label: 'Operator Families', icon: Users },
      { href: '/hidden-families', label: 'Hidden Families', icon: UserSearch },
      { href: '/correlation', label: 'Correlation Risk', icon: Radar },
      { href: '/trends', label: 'Concentration Trends', icon: TrendingUp },
    ],
  },
  {
    label: 'Health',
    items: [
      { href: '/health', label: 'Network Health', icon: HeartPulse },
      { href: '/versions', label: 'Versions & EOL', icon: ShieldAlert },
      { href: '/alerts', label: 'Alerts & Anomalies', icon: AlertTriangle },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/operator', label: 'Operator', icon: User },
      { href: '/api/docs', label: 'API Docs', icon: Network },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Subroute crumb: the URL segment is the only identity the shell can see from
// the client, so hex fingerprints are shortened the way the pages show them.
export function crumbFromPath(pathname: string): string {
  const segment = decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
  if (/^[0-9a-f]{40}$/i.test(segment)) return segment.slice(0, 8).toUpperCase();
  return segment.length > 24 ? `${segment.slice(0, 24)}...` : segment;
}
