import { Skeleton } from "@/components/ui";

// Route-transition skeleton. Mirrors the common workspace shape (header card →
// stat cards → a list/table) so navigating feels instant instead of flashing a
// generic spinner and then jumping to content.
export default function Loading() {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8" aria-busy="true" aria-label="Loading">
      {/* Header card: eyebrow + title + subtitle */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="mt-3 h-7 w-56" />
        <Skeleton className="mt-3 h-4 w-full max-w-md" />
      </section>

      {/* Stat cards row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-6 w-16" />
          </div>
        ))}
      </div>

      {/* List / table */}
      <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-28 sm:block" />
              <Skeleton className="hidden h-4 w-20 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
