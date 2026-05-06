export function DropCardSkeleton() {
  return (
    <article
      className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-5 shadow-lg shadow-black/20 backdrop-blur-sm"
      aria-busy="true"
      aria-label="Loading drop"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-6 w-3/4 max-w-[14rem] animate-pulse rounded-md bg-slate-700/60" />
          <div className="h-5 w-16 animate-pulse rounded-md bg-emerald-800/40" />
        </div>
        <div
          className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-right"
          aria-hidden
        >
          <div className="ml-auto h-3 w-24 animate-pulse rounded bg-slate-700/60" />
          <div className="ml-auto mt-2 h-10 w-16 animate-pulse rounded-md bg-slate-700/50" />
          <div className="ml-auto mt-2 h-3 w-36 animate-pulse rounded bg-slate-700/60" />
        </div>
      </header>

      <div className="flex flex-wrap gap-2" aria-hidden>
        <span className="inline-block h-6 w-20 animate-pulse rounded-full bg-slate-700/50" />
        <span className="inline-block h-6 w-28 animate-pulse rounded-full bg-slate-700/40" />
      </div>

      <section
        className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5"
        aria-hidden
      >
        <div className="h-3 w-28 animate-pulse rounded bg-slate-700/50" />
        <div className="mt-2 h-4 max-w-full animate-pulse rounded bg-slate-800/80" />
        <div className="mt-1.5 h-4 w-[85%] animate-pulse rounded bg-slate-800/60" />
      </section>

      <footer className="border-t border-slate-800 pt-4" aria-hidden>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-700/50" />
      </footer>
    </article>
  );
}

export function DropListSkeleton({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <DropCardSkeleton key={i} />
      ))}
    </>
  );
}
