"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { CANDIDATE_PAGE_SIZES } from "@/lib/candidates/list-config";
import { hrefWithParam } from "@/lib/candidates/list-url";

/**
 * How many rows to load.
 *
 * Opt-in rather than a default, because 500 rows each carry their tags and the
 * departments of every job they applied to. The point is bulk work — sorting
 * thousands of candidates into departments at 100 a page is the chore this
 * exists to end — not to make every page load heavier for everyone.
 *
 * ALWAYS writes ?size=, INCLUDING the default 100. It used to leave the param
 * off when you picked the default, on the reasonable grounds that a default
 * needs no parameter. That stopped being safe the moment the page started
 * remembering your last size: with 500 remembered, clicking 100 produced a URL
 * with no ?size=, the server fell back to the remembered 500, and 100 became a
 * button that did nothing. An explicit param is what tells the server you chose
 * rather than arrived.
 */
export function CandidatePageSize({ size }: { size: number }) {
  const router = useRouter();
  // The live URL — see the note on the tag filter. This control owns ?size= and
  // must not touch anything else.
  const searchParams = useSearchParams();

  return (
    <div className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-1 py-0.5 dark:border-white/10">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
        Show
      </span>
      {CANDIDATE_PAGE_SIZES.map((option) => (
        <button
          key={option}
          onClick={() => router.push(hrefWithParam(searchParams, "size", option))}
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
