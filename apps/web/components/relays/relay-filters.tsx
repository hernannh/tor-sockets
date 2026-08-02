'use client';

import type { CountryOption } from '@/lib/api/queries';
import { cn } from '@/lib/utils';
import { ChevronDown, Loader2, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';

const FLAGS = ['Guard', 'Exit', 'Fast', 'Stable', 'HSDir', 'V2Dir', 'Authority', 'Running'];

export function RelayFilters({ countries }: { countries: CountryOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === '') sp.delete(k);
        else sp.set(k, v);
      }
      sp.delete('offset');
      startTransition(() => router.push(`/relays?${sp.toString()}`));
    },
    [params, router],
  );

  const search = params.get('search') ?? '';
  const country = params.get('country') ?? '';
  const flag = params.get('flag') ?? '';
  const running = params.get('running') ?? '';
  const asNumber = params.get('asNumber') ?? '';

  const hasFilters = Boolean(search || country || flag || running || asNumber);

  // Debounced search: commit to the URL 350ms after the user stops typing, so
  // typing flows without needing Enter (Enter still applies immediately).
  const [draft, setDraft] = useState(search);
  useEffect(() => {
    setDraft(search);
  }, [search]);
  useEffect(() => {
    if (draft === search) return;
    const t = setTimeout(() => update({ search: draft }), 350);
    return () => clearTimeout(t);
  }, [draft, search, update]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/30 p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="search"
          placeholder="nickname or fingerprint"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') update({ search: draft });
          }}
          className="h-9 w-56 rounded-md border border-input bg-background pr-3 pl-8 font-mono text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        />
      </div>

      <FilterSelect
        label="country"
        value={country}
        options={countries.map((c) => ({
          value: c.code,
          label: `${c.code.toUpperCase()} · ${c.name ?? '-'}`,
        }))}
        onChange={(v) => update({ country: v })}
      />

      <FilterSelect
        label="flag"
        value={flag}
        options={FLAGS.map((f) => ({ value: f, label: f }))}
        onChange={(v) => update({ flag: v })}
      />

      <FilterSelect
        label="status"
        value={running}
        options={[
          { value: '', label: 'any status' },
          { value: 'true', label: 'running' },
          { value: 'false', label: 'stopped' },
        ]}
        onChange={(v) => update({ running: v })}
      />

      {hasFilters ? (
        <button
          type="button"
          onClick={() => router.push('/relays')}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" /> clear
        </button>
      ) : null}

      <span
        className={cn(
          'ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-opacity',
          pending ? 'opacity-100' : 'opacity-0',
        )}
        aria-live="polite"
      >
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> filtering…
      </span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-md border border-input bg-background pr-8 pl-2.5 text-sm focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      >
        <option value="">{label}: any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
