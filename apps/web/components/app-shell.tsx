'use client';

import { CircuitMark } from '@/components/brand/circuit-mark';
import { CommandPalette } from '@/components/command-palette';
import { NAV_GROUPS, crumbFromPath } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

// Versioned so a future schema change can migrate cleanly instead of reading a
// stale shape. localStorage throws in private browsing / when disabled, so every
// access is guarded - see readCollapsed / writeCollapsed.
const COLLAPSE_KEY = 'tor-sockets:sidebar-collapsed:v1';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // Quota exceeded or storage disabled (incognito) - preference just won't
    // persist this session. Non-fatal.
  }
}

/**
 * App shell for the dashboard + operator areas: a fixed left sidebar with the
 * nav grouped by category, plus a slim topbar carrying the live consensus
 * status. The landing (`(marketing)`) and auth screens use their own chrome and
 * are intentionally not wrapped by this.
 *
 * Responsive: the sidebar is permanently visible on `lg+` (and collapsible to
 * an icon rail, preference persisted in localStorage); below `lg` it slides in
 * as an off-canvas drawer with a backdrop, opened from the topbar hamburger -
 * the drawer always shows full labels regardless of the collapse state.
 */
export function AppShell({ consensus, children }: { consensus: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop icon rail

  // Load the collapse preference once on mount (avoids SSR/client mismatch).
  useEffect(() => {
    if (readCollapsed()) setCollapsed(true);
  }, []);

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  // Resolve the active section from the nav map for the topbar breadcrumb.
  const activeItem = NAV_GROUPS.flatMap((g) => g.items).find(
    (it) => pathname === it.href || pathname.startsWith(`${it.href}/`),
  );
  const isSubroute =
    !!activeItem && pathname !== activeItem.href && pathname.startsWith(`${activeItem.href}/`);
  const ActiveIcon = activeItem?.icon;

  return (
    <div className="min-h-screen">
      {/* Mobile backdrop */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 cursor-default bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-[transform,width] duration-200 lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-64',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4 lg:px-3">
          <Link href="/" className="flex items-center gap-2" title="tor.sockets">
            <CircuitMark className="shrink-0" />
            <span
              className={cn(
                'font-mono text-sm font-semibold tracking-tight',
                collapsed && 'lg:hidden',
              )}
            >
              tor<span className="text-sidebar-foreground/50">.sockets</span>
            </span>
          </Link>
          <button
            type="button"
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4 [scrollbar-width:thin]">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p
                className={cn(
                  'px-3 pb-1.5 font-condensed text-[11px] tracking-[0.14em] text-sidebar-foreground/40 uppercase',
                  collapsed && 'lg:hidden',
                )}
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.label}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                          collapsed && 'lg:justify-center lg:px-0',
                          active
                            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className={cn('truncate', collapsed && 'lg:hidden')}>
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden border-t border-sidebar-border p-2.5 lg:block">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
              collapsed && 'lg:justify-center lg:px-0',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" />
            )}
            <span className={cn(collapsed && 'lg:hidden')}>
              {collapsed ? 'Expand' : 'Collapse'}
            </span>
          </button>
        </div>
      </aside>

      {/* Main column (offset by the sidebar on desktop) */}
      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          {activeItem ? (
            <div className="flex min-w-0 items-center gap-2">
              {ActiveIcon ? <ActiveIcon className="size-4 shrink-0 text-primary" /> : null}
              <span className="font-display text-sm font-semibold tracking-tight truncate">
                {activeItem.label}
              </span>
              {isSubroute ? (
                <>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                  <span className="truncate font-mono text-sm text-muted-foreground">
                    {crumbFromPath(pathname)}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            <CommandPalette />
            {consensus}
            <a
              href="/api/v1/openapi.json"
              className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              v1
            </a>
          </div>
        </header>

        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
