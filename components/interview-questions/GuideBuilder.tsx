"use client";

import { useState } from "react";
import { Wand2, Copy, Check } from "lucide-react";
import type { InterviewQuestionItem } from "@/lib/data/interview-questions";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/calendar/departments";
import { InterviewTabs } from "@/components/interview-questions/InterviewTabs";
import { Button } from "@/components/ui";

const CATEGORY_LABELS: Record<string, string> = {
  BEHAVIORAL: "Behavioral",
  SITUATIONAL: "Situational",
  TECHNICAL: "Technical",
  EXPERIENCE: "Experience",
  OTHER: "Other"
};
const VALUE_NAME: Record<string, string> = Object.fromEntries(COMPANY_VALUES.map((v) => [v.colorKey, v.name]));

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function GuideBuilder({ questions }: { questions: InterviewQuestionItem[] }) {
  const active = questions.filter((q) => q.isActive);
  const [dept, setDept] = useState("all");
  const [values, setValues] = useState<Set<string>>(new Set());
  const [length, setLength] = useState(8);
  const [guide, setGuide] = useState<InterviewQuestionItem[] | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleValue(key: string) {
    setValues((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pool() {
    if (dept === "all") return active;
    // questions with no department tags apply to all; otherwise must match.
    return active.filter((q) => q.departments.length === 0 || q.departments.includes(dept));
  }

  function build() {
    const available = pool();
    const picked: InterviewQuestionItem[] = [];
    const used = new Set<string>();

    if (values.size > 0) {
      const valueList = [...values];
      const perValue = Math.max(1, Math.floor(length / valueList.length));
      // Round-robin: take perValue from each selected value first (balanced coverage).
      for (const v of valueList) {
        const matches = shuffle(available.filter((q) => q.coreValue === v && !used.has(q.id)));
        for (const q of matches.slice(0, perValue)) {
          picked.push(q);
          used.add(q.id);
        }
      }
      // Fill remaining slots: prefer other questions tagged with a selected value, then anything.
      const prefer = shuffle(available.filter((q) => !used.has(q.id) && q.coreValue && values.has(q.coreValue)));
      const rest = shuffle(available.filter((q) => !used.has(q.id) && (!q.coreValue || !values.has(q.coreValue))));
      for (const q of [...prefer, ...rest]) {
        if (picked.length >= length) break;
        picked.push(q);
        used.add(q.id);
      }
    } else {
      for (const q of shuffle(available).slice(0, length)) picked.push(q);
    }

    setGuide(picked.slice(0, length));
    setCopied(false);
  }

  // Group the generated guide by core value (untagged under "General").
  function grouped(list: InterviewQuestionItem[]) {
    const groups = new Map<string, InterviewQuestionItem[]>();
    for (const q of list) {
      const key = q.coreValue && VALUE_NAME[q.coreValue] ? VALUE_NAME[q.coreValue] : "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(q);
    }
    return [...groups.entries()];
  }

  async function copyGuide() {
    if (!guide) return;
    const deptLabel = dept === "all" ? "All departments" : DEPARTMENT_LABELS[dept as keyof typeof DEPARTMENT_LABELS];
    let text = `Interview Guide — ${deptLabel}\n\n`;
    let n = 1;
    for (const [group, items] of grouped(guide)) {
      text += `${group}\n`;
      for (const q of items) {
        text += `  ${n}. ${q.text}\n`;
        if (q.guidance) text += `     (Look for: ${q.guidance})\n`;
        n += 1;
      }
      text += "\n";
    }
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  const inputCls = "rounded border border-brand-lea/20 px-3 py-2 text-sm outline-none transition focus:border-brand-gold dark:border-white/10";

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview &amp; evaluation</p>
        <h1 className="mt-0.5 flex items-center gap-2 text-3xl font-semibold text-white">
          <Wand2 className="h-7 w-7" /> Build an interview guide
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          Assemble a guide from the question bank — pick a department, the core values to cover, and a length, and we
          pull a balanced set of active questions.
        </p>
      </section>

      <InterviewTabs active="guide" />

      {/* Controls */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Department
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={inputCls}>
              <option value="all">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Number of questions
            <select value={length} onChange={(e) => setLength(Number(e.target.value))} className={inputCls}>
              {[5, 8, 10, 12, 15].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <span className="text-xs text-brand-grey dark:text-slate-400">
              {pool().length} active question{pool().length === 1 ? "" : "s"} available
            </span>
          </div>
        </div>

        <div className="mt-3">
          <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">Core values to cover</span>
          <p className="mb-1.5 text-[11px] text-brand-grey dark:text-slate-400">Leave empty to draw from all values.</p>
          <div className="flex flex-wrap gap-1.5">
            {COMPANY_VALUES.map((v) => {
              const on = values.has(v.colorKey);
              return (
                <button
                  key={v.colorKey}
                  type="button"
                  onClick={() => toggleValue(v.colorKey)}
                  className={`rounded border px-3 py-1 text-xs font-semibold transition hover:shadow-glow ${
                    on ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                  }`}
                >
                  {v.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={build}>
            <Wand2 className="h-4 w-4" /> {guide ? "Regenerate" : "Generate guide"}
          </Button>
          {guide && guide.length > 0 ? (
            <button onClick={copyGuide} className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/10 dark:text-slate-400">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </div>
      </section>

      {/* Result */}
      {guide ? (
        guide.length === 0 ? (
          <section className="rounded bg-white px-4 py-12 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">No matching questions</p>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Add questions to the bank for this department/values, or widen the filters.</p>
          </section>
        ) : (
          <section className="space-y-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            {guide.length < length ? (
              <p className="rounded bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                Only {guide.length} matching question{guide.length === 1 ? "" : "s"} available — add more to the bank to reach {length}.
              </p>
            ) : null}
            {(() => {
              let n = 0;
              return grouped(guide).map(([group, items]) => (
                <div key={group}>
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{group}</h3>
                  <ol className="space-y-2">
                    {items.map((q) => {
                      n += 1;
                      return (
                        <li key={q.id} className="flex gap-2">
                          <span className="shrink-0 text-sm font-semibold text-brand-grey dark:text-slate-400">{n}.</span>
                          <div>
                            <p className="text-sm text-brand-black dark:text-slate-100">
                              {q.text}
                              <span className="ml-2 rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
                                {CATEGORY_LABELS[q.category] ?? q.category}
                              </span>
                            </p>
                            {q.guidance ? <p className="mt-0.5 text-xs italic text-brand-grey dark:text-slate-400">Look for: {q.guidance}</p> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ));
            })()}
          </section>
        )
      ) : (
        <section className="rounded bg-white px-4 py-12 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70 dark:bg-white/5">
            <Wand2 className="h-5 w-5 text-brand-grey dark:text-slate-400" />
          </div>
          <p className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">Set your options and generate</p>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Pick a department and the values to cover, then click Generate guide.</p>
        </section>
      )}
    </div>
  );
}
