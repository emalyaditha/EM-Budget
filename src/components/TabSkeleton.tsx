export default function TabSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 animate-pulse"
          >
            <div className="h-2.5 w-16 rounded bg-[var(--line-strong)]/50 mb-3" />
            <div className="h-5 w-24 rounded bg-[var(--line-strong)]/50" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3 animate-pulse">
        <div className="h-2.5 w-32 rounded bg-[var(--line-strong)]/50" />
        <div className="h-14 rounded-xl bg-[var(--line-strong)]/40" />
        <div className="h-14 rounded-xl bg-[var(--line-strong)]/40" />
        <div className="h-14 rounded-xl bg-[var(--line-strong)]/40" />
      </div>
    </div>
  );
}
