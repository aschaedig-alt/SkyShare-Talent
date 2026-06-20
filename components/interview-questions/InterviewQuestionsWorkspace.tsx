"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Search, ListChecks } from "lucide-react";
import type { InterviewQuestionItem } from "@/lib/data/interview-questions";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/calendar/departments";
import { InterviewTabs } from "@/components/interview-questions/InterviewTabs";

const CATEGORY_LABELS: Record<string, string> = {
  BEHAVIORAL: "Behavioral",
  SITUATIONAL: "Situational",
  TECHNICAL: "Technical",
  EXPERIENCE: "Experience",
  OTHER: "Other"
};
const CATEGORIES = Object.keys(CATEGORY_LABELS);
const VALUE_NAME: Record<string, string> = Object.fromEntries(COMPANY_VALUES.map((v) => [v.colorKey, v.name]));

type FormState = {
  text: string;
  category: string;
  coreValue: string; // "" = none
  departments: string[];
  guidance: string;
  isActive: boolean;
};

const inputCls = "w-full rounded-lg border border-brand-lea/20 px-3 py-2 text-sm outline-none transition focus:border-brand-gold dark:border-white/10";

function toForm(q?: InterviewQuestionItem): FormState {
  return {
    text: q?.text ?? "",
    category: q?.category ?? "BEHAVIORAL",
    coreValue: q?.coreValue ?? "",
    departments: q?.departments ?? [],
    guidance: q?.guidance ?? "",
    isActive: q?.isActive ?? true
  };
}

function QuestionForm({
  initial,
  onCancel,
  onSaved
}: {
  initial?: InterviewQuestionItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggleDept(key: string) {
    set("departments", form.departments.includes(key) ? form.departments.filter((d) => d !== key) : [...form.departments, key]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      text: form.text,
      category: form.category,
      coreValue: form.coreValue || null,
      departments: form.departments,
      guidance: form.guidance || null,
      isActive: form.isActive
    };
    try {
      const url = initial ? `/api/interview-questions/${initial.id}` : "/api/interview-questions";
      const res = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Could not save question.");
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save question.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/5 p-4">
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Question
          <textarea value={form.text} onChange={(e) => set("text", e.target.value)} rows={2} placeholder="e.g. Tell me about a time you put the customer first." className={inputCls} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Category
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Core value
            <select value={form.coreValue} onChange={(e) => set("coreValue", e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {COMPANY_VALUES.map((v) => (
                <option key={v.colorKey} value={v.colorKey}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">Departments</span>
          <p className="mb-1.5 text-[11px] text-brand-grey dark:text-slate-400">Which departments this question suits — leave empty for all.</p>
          <div className="flex flex-wrap gap-1.5">
            {DEPARTMENTS.map((d) => {
              const active = form.departments.includes(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDept(d.key)}
                  className={`rounded border px-3 py-1 text-xs font-semibold transition hover:shadow-glow ${
                    active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          What a strong answer looks like (optional)
          <textarea value={form.guidance} onChange={(e) => set("guidance", e.target.value)} rows={2} placeholder="Interviewer guidance / scoring notes" className={inputCls} />
        </label>

        <label className="flex items-center gap-2 text-sm text-brand-lea dark:text-slate-100">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active (available when building guides)
        </label>
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        {error ? <span className="mr-auto text-xs font-medium text-red-700">{error}</span> : null}
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || form.text.trim().length < 5}
          className="rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
        >
          {busy ? "Saving…" : initial ? "Save changes" : "Add question"}
        </button>
      </div>
    </div>
  );
}

function Badge({ children, tone = "sweet" }: { children: ReactNode; tone?: "sweet" | "gold" | "grey" }) {
  const cls =
    tone === "gold"
      ? "bg-brand-gold/20 text-brand-lea dark:text-slate-100"
      : tone === "grey"
        ? "bg-brand-cloudDancer/70 text-brand-grey dark:bg-white/5 dark:text-slate-400"
        : "bg-brand-sweet/25 text-brand-lea dark:text-slate-100";
  return <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function InterviewQuestionsWorkspace({ questions }: { questions: InterviewQuestionItem[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fVal, setFVal] = useState("all");
  const [fDept, setFDept] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter((item) => {
      if (q && !item.text.toLowerCase().includes(q) && !(item.guidance ?? "").toLowerCase().includes(q)) return false;
      if (fCat !== "all" && item.category !== fCat) return false;
      if (fVal !== "all" && item.coreValue !== fVal) return false;
      if (fDept !== "all" && !item.departments.includes(fDept)) return false;
      return true;
    });
  }, [questions, search, fCat, fVal, fDept]);

  const activeCount = questions.filter((q) => q.isActive).length;

  function afterSave() {
    setCreating(false);
    setEditingId(null);
    router.refresh();
  }

  async function remove(item: InterviewQuestionItem) {
    if (!window.confirm("Delete this question? This cannot be undone.")) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/interview-questions/${item.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(item: InterviewQuestionItem) {
    setBusyId(item.id);
    try {
      await fetch(`/api/interview-questions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive })
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="overflow-hidden rounded-xl bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview &amp; evaluation</p>
            <h1 className="mt-0.5 flex items-center gap-2 text-3xl font-semibold text-white">
              <ListChecks className="h-7 w-7" /> Question bank
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/75">
              A reusable library of interview questions, tagged by category, core value, and department — the source the
              interview-guide builder will draw from.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-lea shadow-sm transition hover:bg-brand-cloudDancer dark:bg-[#10243a] dark:text-slate-100"
          >
            <Plus className="h-4 w-4" /> New question
          </button>
        </div>
      </section>

      <InterviewTabs active="bank" />

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions" className={`${inputCls} pl-9`} />
        </div>
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={fVal} onChange={(e) => setFVal(e.target.value)} className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10">
          <option value="all">All values</option>
          {COMPANY_VALUES.map((v) => (
            <option key={v.colorKey} value={v.colorKey}>
              {v.name}
            </option>
          ))}
        </select>
        <select value={fDept} onChange={(e) => setFDept(e.target.value)} className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10">
          <option value="all">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
        <span className="ml-auto rounded bg-brand-cloudDancer/70 px-3 py-1 text-xs font-semibold text-brand-lea dark:bg-white/5 dark:text-slate-100">
          {filtered.length} shown · {activeCount} active
        </span>
      </section>

      {creating ? <QuestionForm onCancel={() => setCreating(false)} onSaved={afterSave} /> : null}

      {/* List */}
      <section className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl bg-white px-4 py-16 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70 dark:bg-white/5">
              <ListChecks className="h-5 w-5 text-brand-grey dark:text-slate-400" />
            </div>
            <div className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">{questions.length === 0 ? "No questions yet" : "No questions match"}</div>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              {questions.length === 0 ? "Add your first interview question to start the bank." : "Adjust or clear the filters above."}
            </p>
          </div>
        ) : (
          filtered.map((item) =>
            editingId === item.id ? (
              <QuestionForm key={item.id} initial={item} onCancel={() => setEditingId(null)} onSaved={afterSave} />
            ) : (
              <div key={item.id} className={`rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10 ${item.isActive ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-brand-black dark:text-slate-100">{item.text}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => toggleActive(item)} disabled={busyId === item.id} title={item.isActive ? "Mark inactive" : "Mark active"} className="rounded px-2 py-1 text-[11px] font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:bg-white/5">
                      {item.isActive ? "Active" : "Inactive"}
                    </button>
                    <button onClick={() => { setCreating(false); setEditingId(item.id); }} title="Edit" className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:bg-white/5">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(item)} disabled={busyId === item.id} title="Delete" className="rounded p-1.5 text-brand-grey transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="grey">{CATEGORY_LABELS[item.category] ?? item.category}</Badge>
                  {item.coreValue ? <Badge tone="gold">{VALUE_NAME[item.coreValue] ?? item.coreValue}</Badge> : null}
                  {item.departments.map((d) => (
                    <Badge key={d}>{DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS] ?? d}</Badge>
                  ))}
                </div>
                {item.guidance ? <p className="mt-2 border-l-2 border-brand-sweet/40 pl-2 text-xs italic text-brand-grey dark:text-slate-400">{item.guidance}</p> : null}
              </div>
            )
          )
        )}
      </section>
    </div>
  );
}
