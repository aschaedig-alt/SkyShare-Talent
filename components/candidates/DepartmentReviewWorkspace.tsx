"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Building2, AlertCircle } from "lucide-react";
import type { DepartmentReviewRow } from "@/lib/data/department-review";
import {
  CANDIDATE_DEPARTMENTS,
  type CandidateDepartmentKey
} from "@/lib/candidates/departments";
import { Button } from "@/components/ui";

const BASIS_LABEL: Record<DepartmentReviewRow["basis"], string> = {
  "job-title": "job applied to",
  "pilot-application": "pilot application on file",
  source: "how they arrived",
  "current-title": "current title",
  none: "no signal"
};

/**
 * Work through the candidates nobody's application can place.
 *
 * Every proposal comes from a STRUCTURED field and shows its evidence, so the
 * reasoning is on screen and can be overruled per row. Nothing is written until
 * Apply, and anything written can be cleared back to the derived value — the
 * column was empty before this screen existed.
 */
export function DepartmentReviewWorkspace({ rows }: { rows: DepartmentReviewRow[] }) {
  const router = useRouter();
  // Row -> the department that will be written. Seeded from the proposal, so
  // "Apply" with nothing touched does the obvious thing.
  const [choices, setChoices] = useState<Record<string, CandidateDepartmentKey | "">>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.proposal ?? ""]))
  );
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const pending = useMemo(
    () => rows.filter((r) => !skipped.has(r.id) && choices[r.id]),
    [rows, choices, skipped]
  );

  const grouped = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of pending) counts.set(choices[r.id] as string, (counts.get(choices[r.id] as string) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [pending, choices]);

  async function apply() {
    if (pending.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/department", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: pending.map((r) => ({ candidateId: r.id, department: choices[r.id] }))
        })
      });
      const body = (await res.json().catch(() => null)) as { updated?: number; message?: string } | null;
      if (!res.ok) {
        setError(body?.message ?? `Could not save (${res.status}).`);
        setBusy(false);
        return;
      }
      setDone(body?.updated ?? pending.length);
      router.refresh();
    } catch {
      setError("Network error — nothing was saved.");
    }
    setBusy(false);
  }

  if (rows.length === 0) {
    return (
      <section className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <Check className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
        </div>
        <div className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">
          Every candidate has a department
        </div>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Nobody is left unplaced. New candidates will appear here if they arrive without one.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">
              {rows.length} candidate{rows.length === 1 ? "" : "s"} with no department
            </h2>
            <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
              Each proposal comes from a field on their record, shown beside it. Change any row, or set it to
              &ldquo;Leave unassigned&rdquo; to skip. Nothing is saved until you apply.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void apply()} disabled={busy || pending.length === 0}>
              {busy ? "Applying…" : <><Check className="h-4 w-4" /> Apply {pending.length}</>}
            </Button>
          </div>
        </div>

        {grouped.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {grouped.map(([key, count]) => {
              const dept = CANDIDATE_DEPARTMENTS.find((d) => d.key === key);
              if (!dept) return null;
              return (
                <span key={key} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${dept.chip}`}>
                  {dept.label} {count}
                </span>
              );
            })}
          </div>
        )}

        {error && <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}
        {done !== null && (
          <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
            Set the department on {done} candidate{done === 1 ? "" : "s"}. They now show that department everywhere,
            and it can be changed on their profile at any time.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.16em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-bold">Candidate</th>
                <th className="px-4 py-3 font-bold">Why</th>
                <th className="px-4 py-3 font-bold">Department to set</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
              {rows.map((row) => {
                const choice = choices[row.id] ?? "";
                const isSkipped = skipped.has(row.id) || !choice;
                return (
                  <tr key={row.id} className={`row-wash align-top ${isSkipped ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/candidates/${row.id}`}
                        prefetch={false}
                        className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100"
                      >
                        {row.displayName}
                      </Link>
                      <div className="text-xs text-brand-grey dark:text-slate-400">
                        {row.currentTitle ?? "No current role"}
                        {row.stage ? ` · ${row.stage}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.evidence ? (
                        <div className="text-xs text-brand-lea dark:text-slate-100">
                          {row.evidence}
                          <span className="ml-1 text-brand-grey dark:text-slate-400">({BASIS_LABEL[row.basis]})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Nothing on their record says which department — pick one by hand
                        </div>
                      )}
                      {row.source && (
                        <div className="mt-0.5 truncate text-[11px] text-brand-grey dark:text-slate-500">
                          Source: {row.source}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={choice}
                        onChange={(e) => {
                          const value = e.target.value as CandidateDepartmentKey | "";
                          setChoices((prev) => ({ ...prev, [row.id]: value }));
                          setSkipped((prev) => {
                            const next = new Set(prev);
                            if (value) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          });
                        }}
                        className="w-48 rounded border border-brand-lea/20 bg-white px-2 py-1.5 text-xs text-brand-black outline-none transition focus:ring-2 focus:ring-brand-gold/50 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                      >
                        <option value="">Leave unassigned</option>
                        {CANDIDATE_DEPARTMENTS.filter((d) => d.key !== "unassigned").map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-brand-grey dark:text-slate-400">
        <Building2 className="h-3 w-3" />
        Setting a department here overrides the one derived from their application. Clearing it back to
        &ldquo;Unassigned&rdquo; on their profile returns them to the derived value.
      </p>
    </div>
  );
}
