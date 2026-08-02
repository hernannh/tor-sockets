import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type Props = {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  offset: number;
  limit: number;
  total: number;
  /** URL param names (default 'offset'/'limit'); lets two feeds paginate independently. */
  offsetParam?: string;
  limitParam?: string;
};

export function Pagination({
  basePath,
  searchParams,
  offset,
  limit,
  total,
  offsetParam = 'offset',
  limitParam = 'limit',
}: Props) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  const href = (dir: 'prev' | 'next') => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== '') sp.set(k, v);
    }
    const next = dir === 'prev' ? Math.max(0, offset - limit) : offset + limit;
    sp.set(offsetParam, String(next));
    sp.set(limitParam, String(limit));
    return `${basePath}?${sp.toString()}`;
  };

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <p className="text-muted-foreground">
        Showing <span className="font-mono text-foreground">{from}</span>-
        <span className="font-mono text-foreground">{to}</span> of{' '}
        <span className="font-mono text-foreground">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={href('prev')}
          aria-disabled={!hasPrev}
          className={`inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs transition-colors ${
            hasPrev ? 'hover:bg-secondary hover:text-foreground' : 'pointer-events-none opacity-40'
          }`}
        >
          <ChevronLeft className="size-3.5" /> Prev
        </Link>
        <Link
          href={href('next')}
          aria-disabled={!hasNext}
          className={`inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs transition-colors ${
            hasNext ? 'hover:bg-secondary hover:text-foreground' : 'pointer-events-none opacity-40'
          }`}
        >
          Next <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
