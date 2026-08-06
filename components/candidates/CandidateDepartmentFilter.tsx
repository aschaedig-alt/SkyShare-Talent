"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Building2, X, Check } from "lucide-react";
import {
  CANDIDATE_DEPARTMENTS,
  type CandidateDepartmentKey
} from "@/lib/candidates/departments";
import { buildCandidatesHref } from "@/lib/candidates/list-url";

/**
 * Narrow the candidate list by department.
 *
 * Department is DERIVED from the job each candidate applied to — there is no
 * department column on a candidate, and this filter runs in the database
 * against the raw Job.department strings (see lib/candidates/departments.ts).
 *
 * OR across departments, unlike the tag filter's AND: a candidate has one
 * department in practice, so ANDing Maintenance and FBO would always return
 * nobody. The menu says so, because two adjacent filters that combine their
 * selections differently is otherwise a trap.
 *
 * router.push is right here for the same reason it is on the tag filter — this
 * re-queries the page you are on, it does not navigate to another one.
 */
export function CandidateDepartmentFilter({
  active,
  query,
  tags,
  size,
  counts
}: {
  active: string[];
  query: string;
  tags: string[];
  size: number;
  /** How many candidates each department holds under the CURRENT search/tags. */
  counts?: Partial<Record<CandidateDepartmentKey, number>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const activeSet = useMemo(() => new Set(active), [active]);

  function apply(next: string[]) {
    router.push(buildCandidatesHref({ query, tags, departments: next, size }));
  }

  function toggle(key: string) {
    apply(activeSet.has(key) ? active.filter((d) => d !== key) : [...active, key]);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition",
          active.length
            ? "border-brand-gold bg-brand-gold/15 text-brand-lea dark:text-slate-100"
            : "border-brand-lea/20 text-brand-lea hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
        )}
      >
        <Building2 className="h-3.5 w-3.5" />
        {active.length
          ? `${active.length} department${active.length === 1 ? "" : "s"}`
          : "Filter by department"}
      </button>

      {active.length > 0 ? (
        <button
          onClick={() => apply([])}
          className="ml-1 inline-flex items-center gap-1 rounded border border-brand-lea/15 px-1.5 py-1 text-[11px] font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
          title="Clear department filter"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}

      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-64 rounded border border-brand-lea/15 bg-white p-2 shadow-panel dark:border-white/10 dark:bg-brand-panel">
            {active.length > 1 ? (
              <p className="mb-1.5 text-[10.5px] leading-snug text-brand-grey dark:text-slate-400">
                Showing people in <span className="font-semibold">any</span> of the selected departments.
              </p>
            ) : null}

            {CANDIDATE_DEPARTMENTS.map((dept) => {
              const on = activeSet.has(dept.key);
              const count = counts?.[dept.key];
              return (
                <button
                  key={dept.key}
                  onClick={() => toggle(dept.key)}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition hover:bg-brand-gold/10",
                    on && "bg-brand-gold/15"
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                      on ? "border-brand-gold bg-brand-gold text-white" : "border-brand-lea/25 dark:border-white/20"
                    )}
                  >
                    {on ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-brand-lea dark:text-slate-100">
                    {dept.label}
                  </span>
                  {typeof count === "number" ? (
                    <span className="shrink-0 text-[10.5px] tabular-nums text-brand-grey dark:text-slate-400">
                      {count.toLocaleString()}
                    </span>
                  ) : null}
                </button>
              );
            })}

            <div className="mt-1.5 border-t border-brand-lea/10 pt-1.5 dark:border-white/10">
              <p className="text-[10px] leading-snug text-brand-grey dark:text-slate-500">
                Read from the job each person applied to, unless one was set by hand. Unassigned means no
                application, or a job with no department set.
              </p>
              {/* A real link — this loads another page. */}
              <Link
                href="/candidates/departments"
                className="mt-1 inline-block text-[11px] font-semibold text-brand-lea underline transition hover:text-brand-gold dark:text-slate-100"
              >
                Place the unassigned →
              </Link>
            </div>
          </div>
        </>
      ) : null}

      {active.length > 0 ? (
        <div className="absolute right-0 top-full z-10 mt-1 flex max-w-[320px] flex-wrap justify-end gap-1">
          {active.map((key) => {
            const dept = CANDIDATE_DEPARTMENTS.find((d) => d.key === key);
            if (!dept) return null;
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={clsx("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold", dept.chip)}
                title={`Remove the ${dept.label} filter`}
              >
                {dept.label}
                <X className="h-2.5 w-2.5" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
