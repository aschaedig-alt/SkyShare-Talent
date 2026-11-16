"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X, GraduationCap } from "lucide-react";
import { STRENGTH_LABEL, isAnswerStrength } from "@/lib/interview-guides/constants";
import { VALUE_NAME } from "@/lib/interview-guides/values";

// What the draft evaluator has learned: the interviewer's corrections of its
// calls (lib/interview-guides/learning.server.ts). Folded by default with a
// count; open it to read each lesson and remove any that should not be followed.

type Correction = {
  id: string;
  kind: string;
  questionText: string;
  answerText: string;
  aiValue: string;
  humanValue: string;
  createdBy: string | null;
  updatedAt: string;
};

function fmt(kind: string, raw: string): string {
  if (kind === "VALUES") {
    try {
      const arr = JSON.parse(raw) as string[];
      return arr.length ? arr.map((k) => VALUE_NAME[k] ?? k).join(", ") : "no values";
    } catch {
      return raw;
    }
  }
  return isAnswerStrength(raw) ? STRENGTH_LABEL[raw] : "no rating";
}

export function LearnedPanel({ refreshKey }: { refreshKey: string }) {
  const [rows, setRows] = useState<Correction[] | null>(null);
  const [perRun, setPerRun] = useState(25);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/interview-guides/corrections", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "hidden" : "Could not load what it has learned.");
      const body = (await res.json()) as { perRun: number; corrections: Correction[] };
      setRows(body.corrections);
      setPerRun(body.perRun);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load what it has learned.");
    }
  }, []);

  // Corrections are recorded on the server after a save, so wait a moment.
  useEffect(() => {
    const t = setTimeout(() => void load(), first.current ? 0 : 600);
    first.current = false;
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  async function forget(id: string) {
    setRows((cur) => (cur ? cur.filter((r) => r.id !== id) : cur));
    const res = await fetch(`/api/interview-guides/corrections/${id}`, { method: "DELETE" });
    if (!res.ok) void load();
  }

  if (error === "hidden") return null;
  const n = rows?.length ?? 0;

  return (
    <div className="mt-4 rounded border border-brand-lea/10 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/50 dark:text-slate-100 dark:hover:bg-white/5"
      >
        {open ? <ChevronDown className="h-4 w-4 text-brand-grey" /> : <ChevronRight className="h-4 w-4 text-brand-grey" />}
        <GraduationCap className="h-4 w-4 text-brand-eden dark:text-brand-sweet" />
        What it has learned from you
        <span className="font-normal text-brand-grey dark:text-slate-400">
          · {rows === null ? "…" : `${n} correction${n === 1 ? "" : "s"}`}
          {n > perRun ? ` (it reads the newest ${perRun})` : ""}
        </span>
      </button>
      {open ? (
        <div className="border-t border-brand-lea/10 px-3 py-2 dark:border-white/10">
          {error ? <p className="text-xs text-red-700 dark:text-red-300">{error}</p> : null}
          {rows && rows.length === 0 ? (
            <p className="text-xs text-brand-grey dark:text-slate-400">
              Nothing yet. Change a rating or a value the evaluator suggested and it is saved here.
            </p>
          ) : null}
          <ul className="divide-y divide-brand-lea/10 dark:divide-white/10">
            {(rows ?? []).map((r, i) => (
              <li key={r.id} className={`flex items-start gap-2 py-2 ${i >= perRun ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-semibold text-brand-lea dark:text-slate-100">{r.questionText}</div>
                  <div className="mt-0.5 text-brand-grey dark:text-slate-400">
                    {r.kind === "VALUES" ? "Values" : "Rating"}: it said <b className="text-brand-lea dark:text-slate-200">{fmt(r.kind, r.aiValue)}</b>, you changed it to{" "}
                    <b className="text-brand-lea dark:text-slate-200">{fmt(r.kind, r.humanValue)}</b>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-brand-grey/80 dark:text-slate-500">“{r.answerText}”</div>
                </div>
                <button
                  type="button"
                  onClick={() => void forget(r.id)}
                  title="Forget this correction"
                  aria-label="Forget this correction"
                  className="shrink-0 rounded p-1 text-brand-grey transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
