"use client";

import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CANDIDATE_PAGE_SIZES } from "@/lib/candidates/list-config";
import { buildCandidatesHref } from "@/lib/candidates/list-url";

/**
 * How many rows to load.
 *
 * Opt-in rather than a default, because 500 rows each carry their tags and the
 * departments of every job they applied to. The point is bulk work — sorting
 * thousands of candidates into departments at 100 a page is the chore this
 * exists to end — not to make every page load heavier for everyone.
 */
export function CandidatePageSize({
  size,
  query,
  tags,
  departments
}: {
  size: number;
  query: string;
  tags: string[];
  departments: string[];
}) {
  const router = useRouter();

  return (
    <div className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-1 py-0.5 dark:border-white/10">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
        Show
      </span>
      {CANDIDATE_PAGE_SIZES.map((option) => (
        <button
          key={option}
          onClick={() => router.push(buildCandidatesHref({ query, tags, departments, size: option }))}
          className={clsx(
            "rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition",
            option === size
              ? "bg-brand-lea text-white"
              : "text-brand-grey hover:bg-brand-gold/10 hover:text-brand-lea dark:text-slate-400"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
