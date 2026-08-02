'use client';

import { NAV_ITEMS, type NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RelayHit = { fingerprint: string; nickname: string; country: string | null; running: boolean };
type Row =
  | { kind: 'page'; key: string; href: string; label: string; icon: NavItem['icon'] }
  | { kind: 'relay'; key: string; href: string; label: string; hint: string; running: boolean };

const RELAY_LIMIT = 8;
const DEBOUNCE_MS = 200;

/**
 * Global search. Twelve sections and ten thousand relays behind a 25-row
 * paginated directory means the keyboard is the only fast way in.
 *
 * Sections are matched locally; relays go through the public search endpoint
 * (substring on nickname or fingerprint), debounced, with the previous request
 * aborted so out-of-order responses cannot overwrite newer results.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [relays, setRelays] = useState<RelayHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setRelays([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/relays?search=${encodeURIComponent(trimmed)}&limit=${RELAY_LIMIT}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { relays?: RelayHit[] };
        setRelays(body.relays ?? []);
      } catch {
        if (!controller.signal.aborted) setRelays([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(id);
    };
  }, [trimmed]);

  const rows = useMemo<Row[]>(() => {
    const needle = trimmed.toLowerCase();
    const pages: Row[] = NAV_ITEMS.filter(
      (it) => needle === '' || it.label.toLowerCase().includes(needle),
    ).map((it) => ({ kind: 'page', key: it.href, href: it.href, label: it.label, icon: it.icon }));
    const relayRows: Row[] = relays.map((r) => ({
      kind: 'relay',
      key: r.fingerprint,
      href: `/relays/${r.fingerprint}`,
      label: r.nickname,
      hint: `${r.fingerprint.slice(0, 8)}${r.country ? ` · ${r.country.toUpperCase()}` : ''}`,
      running: r.running,
    }));
    return [...pages, ...relayRows];
  }, [trimmed, relays]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the cursor whenever the result set changes.
  useEffect(() => {
    setActive(0);
  }, [rows.length, trimmed]);

  const go = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      setOpen(false);
      setQuery('');
      router.push(row.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(rows[active]);
    }
  };

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border/60 px-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        aria-label="Search relays and sections"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-border/60 px-1 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
          <DialogPrimitive.Content
            onKeyDown={onKeyDown}
            className="fixed top-[15vh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          >
            <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Jump to a section or search relays by nickname or fingerprint.
            </DialogPrimitive.Description>

            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to a section, or search a relay..."
                className="h-12 w-full bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none"
              />
              {loading ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
              ) : null}
            </div>

            <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
              {rows.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {trimmed.length < 2
                    ? 'Type at least two characters to search relays.'
                    : 'Nothing matches that.'}
                </p>
              ) : (
                rows.map((row, i) => (
                  <button
                    key={`${row.kind}:${row.key}`}
                    type="button"
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(row)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                      i === active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {row.kind === 'page' ? (
                      <>
                        <row.icon className="size-4 shrink-0" />
                        <span className="truncate">{row.label}</span>
                        <span className="ml-auto font-mono text-[11px] text-muted-foreground/60">
                          {row.href}
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            row.running ? 'bg-status-running' : 'bg-status-stopped',
                          )}
                        />
                        <span className="truncate font-medium text-foreground">{row.label}</span>
                        <span className="ml-auto font-mono text-[11px] text-muted-foreground/60">
                          {row.hint}
                        </span>
                      </>
                    )}
                  </button>
                ))
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
