"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Search, ListChecks, GripVertical, ChevronUp, ChevronDown, Copy, FileUp, Paintbrush } from "lucide-react";
import type { InterviewQuestionItem } from "@/lib/data/interview-questions";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/calendar/departments";
import { InterviewTabs } from "@/components/interview-questions/InterviewTabs";
import { Button } from "@/components/ui";
import { RichTextEditor, RichTextView } from "@/components/richtext/RichTextEditor";
import { questionHtml, questionPlain } from "@/lib/interview-questions/rich";
import { GuidanceBlocks } from "@/components/interview-questions/GuidanceBlocks";
import { QuestionImport } from "@/components/interview-questions/QuestionImport";
import { describeStyle, fieldStyle, QUESTION_FIELD_LABEL, type QuestionField } from "@/lib/interview-questions/format";

const CATEGORY_LABELS: Record<string, string> = {
  BEHAVIORAL: "Behavioral",
  SITUATIONAL: "Situational",
  TECHNICAL: "Technical",
  EXPERIENCE: "Experience",
  CULTURE: "Culture",
  GENERAL: "General",
  OTHER: "Other"
};
const CATEGORIES = Object.keys(CATEGORY_LABELS);
const VALUE_NAME: Record<string, string> = Object.fromEntries(COMPANY_VALUES.map((v) => [v.colorKey, v.name]));

type FormState = {
  /** Rich-text HTML. */
  text: string;
  category: string;
  coreValues: string[];
  departments: string[];
  /** Rich-text HTML. */
  strongAnswer: string;
  /** Rich-text HTML. */
  listenFor: string;
  isActive: boolean;
};

const inputCls = "w-full rounded border border-brand-lea/20 px-3 py-2 text-sm outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const fieldLabel = "text-xs font-semibold text-brand-lea dark:text-slate-100";

/** Chip used for both multi-selects (core values, departments): selected = navy + gold. */
function chipCls(active: boolean): string {
  return `rounded border px-3 py-1 text-xs font-semibold transition hover:shadow-glow ${
    active ? "border-brand-gold bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
  }`;
}

function toForm(q?: InterviewQuestionItem): FormState {
  return {
    text: questionHtml(q?.text),
    category: q?.category ?? "BEHAVIORAL",
    coreValues: q?.coreValues ?? [],
    departments: q?.departments ?? [],
    strongAnswer: q?.strongAnswer ?? "",
    listenFor: q?.listenFor ?? "",
    isActive: q?.isActive ?? true
  };
}

function QuestionForm({
  initial,
  copyFrom,
  onCancel,
  onSaved,
  onFormatApplied
}: {
  /** Editing this question. */
  initial?: InterviewQuestionItem;
  /** A NEW question pre-filled from this one, formatting and all (feedback cmwcmsbwn). */
  copyFrom?: InterviewQuestionItem;
  onCancel: () => void;
  onSaved: () => void;
  onFormatApplied: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial ?? copyFrom));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<QuestionField | null>(null);

  /**
   * "If i change the size of the font or something in one question box, give
   * me the option to apply to all questions" (feedback cmwcmsbwn). Copies what
   * covers the WHOLE box (see lib/interview-questions/format.ts); undoable.
   */
  async function applyToAll(field: QuestionField) {
    const style = fieldStyle(form[field]);
    if (!style) {
      setError(`Type something in the ${QUESTION_FIELD_LABEL[field]} box first — its formatting is what gets copied.`);
      return;
    }
    const ok = window.confirm(
      `Make the ${QUESTION_FIELD_LABEL[field]} box on EVERY question in the bank: ${describeStyle(style)}?\n\n` +
        "Only formatting changes, never wording. Bold or italics on just a few words inside a question are kept. " +
        "You can undo this from the top of the list."
    );
    if (!ok) return;
    setApplying(field);
    setError(null);
    try {
      const res = await fetch("/api/interview-questions/apply-format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", field, html: form[field] })
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; changed?: number; label?: string };
      if (!res.ok) throw new Error(body.message ?? "Could not apply the formatting.");
      onFormatApplied(`${body.label}: ${body.changed} question${body.changed === 1 ? "" : "s"} changed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not apply the formatting.");
    } finally {
      setApplying(null);
    }
  }

  const fieldHead = (field: QuestionField, label: string) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className={fieldLabel}>{label}</span>
      <button
        type="button"
        onClick={() => applyToAll(field)}
        disabled={applying !== null}
        title={`Give the ${QUESTION_FIELD_LABEL[field]} box on every question this box's formatting (size, colour, and bold/italic when the whole box has it)`}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea disabled:opacity-50 dark:text-brand-sweet dark:hover:bg-white/10"
      >
        <Paintbrush className="h-3 w-3" /> {applying === field ? "Applying…" : "Apply this formatting to all questions"}
      </button>
    </div>
  );

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggle(field: "departments" | "coreValues", key: string) {
    setForm((f) => ({ ...f, [field]: f[field].includes(key) ? f[field].filter((d) => d !== key) : [...f[field], key] }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      text: form.text,
      category: form.category,
      coreValues: form.coreValues,
      departments: form.departments,
      strongAnswer: questionPlain(form.strongAnswer) ? form.strongAnswer : "",
      listenFor: questionPlain(form.listenFor) ? form.listenFor : "",
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
    <div className="rounded border border-brand-gold/30 bg-brand-gold/5 p-4">
      <div className="grid gap-3">
        {/* Not a <label>: the editor must not sit inside one (see RichTextEditor). */}
        <div className="grid gap-1">
          {fieldHead("text", "Question")}
          <RichTextEditor
            value={form.text}
            onChange={(html) => set("text", html)}
            minHeight={70}
            placeholder="e.g. Tell me about a time you put the customer first."
            ariaLabel="Question"
          />
        </div>

        <label className={`grid gap-1 sm:max-w-xs ${fieldLabel}`}>
          Category
          <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className={fieldLabel}>Core values</span>
          <p className="mb-1.5 text-[11px] text-brand-grey dark:text-slate-400">Pick every value this question speaks to — leave empty for none.</p>
          <div className="flex flex-wrap gap-1.5">
            {COMPANY_VALUES.map((v) => (
              <button key={v.colorKey} type="button" aria-pressed={form.coreValues.includes(v.colorKey)} onClick={() => toggle("coreValues", v.colorKey)} className={chipCls(form.coreValues.includes(v.colorKey))}>
                {v.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={fieldLabel}>Departments</span>
          <p className="mb-1.5 text-[11px] text-brand-grey dark:text-slate-400">Which departments this question suits — leave empty for all.</p>
          <div className="flex flex-wrap gap-1.5">
            {DEPARTMENTS.map((d) => (
              <button key={d.key} type="button" aria-pressed={form.departments.includes(d.key)} onClick={() => toggle("departments", d.key)} className={chipCls(form.departments.includes(d.key))}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1">
          {fieldHead("strongAnswer", "Strong answer (optional)")}
          <RichTextEditor
            value={form.strongAnswer}
            onChange={(html) => set("strongAnswer", html)}
            minHeight={90}
            placeholder="What a strong answer sounds like"
            ariaLabel="Strong answer"
          />
        </div>

        <div className="grid gap-1">
          {fieldHead("listenFor", "Listen for (optional)")}
          <RichTextEditor
            value={form.listenFor}
            onChange={(html) => set("listenFor", html)}
            minHeight={70}
            placeholder="What the interviewer should listen for"
            ariaLabel="Listen for"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-brand-lea dark:text-slate-100">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active (available when building guides and scorecards)
        </label>
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        {error ? <span className="mr-auto text-xs font-medium text-red-700 dark:text-red-300">{error}</span> : null}
        <button type="button" onClick={onCancel} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
          Cancel
        </button>
        <Button onClick={save} disabled={busy || questionPlain(form.text).length < 5}>
          {busy ? "Saving…" : initial ? "Save changes" : "Add question"}
        </Button>
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

/** Active questions first (the server sorts that way too), saved order within each. */
function orderedIds(list: InterviewQuestionItem[]): string[] {
  return [...list.filter((q) => q.isActive), ...list.filter((q) => !q.isActive)].map((q) => q.id);
}

export function InterviewQuestionsWorkspace({ questions }: { questions: InterviewQuestionItem[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  /** Set when "Duplicate" opened the new-question form from an existing question. */
  const [copyFrom, setCopyFrom] = useState<InterviewQuestionItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formatUndo, setFormatUndo] = useState<{ label: string; count: number } | null>(null);

  const loadFormatUndo = useCallback(async () => {
    try {
      const res = await fetch("/api/interview-questions/apply-format");
      const body = (await res.json()) as { undo: { label: string; count: number } | null };
      setFormatUndo(body.undo);
    } catch {
      /* the Undo bar is a convenience; the page works without it */
    }
  }, []);
  useEffect(() => {
    void loadFormatUndo();
  }, [loadFormatUndo]);

  function onFormatApplied(message: string) {
    setNotice(message);
    void loadFormatUndo();
    router.refresh();
  }

  async function undoFormat() {
    if (!formatUndo || !window.confirm(`Undo "${formatUndo.label}" on ${formatUndo.count} question${formatUndo.count === 1 ? "" : "s"}?`)) return;
    const res = await fetch("/api/interview-questions/apply-format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "undo" })
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string; restored?: number; skipped?: number };
    setNotice(
      res.ok
        ? `Formatting undone on ${body.restored} question${body.restored === 1 ? "" : "s"}.` +
            (body.skipped ? ` ${body.skipped} edited since were left as they are.` : "")
        : body.message ?? "Could not undo."
    );
    void loadFormatUndo();
    router.refresh();
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fVal, setFVal] = useState("all");
  const [fDept, setFDept] = useState("all");

  // The order on screen. Held locally so a move shows at once; re-taken from
  // the server whenever the set of questions (or their active state) changes.
  const serverKey = questions.map((q) => `${q.id}:${q.isActive ? 1 : 0}`).join("|");
  const [order, setOrder] = useState<string[]>(() => orderedIds(questions));
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setOrder(orderedIds(questions));
  }
  const [orderError, setOrderError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const ordered = useMemo(() => order.map((id) => byId.get(id)).filter((q): q is InterviewQuestionItem => Boolean(q)), [order, byId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ordered.filter((item) => {
      if (q && !questionPlain(item.text).toLowerCase().includes(q) && !questionPlain(item.strongAnswer).toLowerCase().includes(q) && !questionPlain(item.listenFor).toLowerCase().includes(q)) return false;
      if (fCat !== "all" && item.category !== fCat) return false;
      if (fVal !== "all" && !item.coreValues.includes(fVal)) return false;
      if (fDept !== "all" && !item.departments.includes(fDept)) return false;
      return true;
    });
  }, [ordered, search, fCat, fVal, fDept]);

  const activeCount = questions.filter((q) => q.isActive).length;

  function afterSave() {
    setCreating(false);
    setCopyFrom(null);
    setEditingId(null);
    router.refresh();
  }

  async function remove(item: InterviewQuestionItem) {
    if (!window.confirm("Delete this question? This cannot be undone. (To keep it but stop using it, switch it to Inactive instead.)")) return;
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

  async function saveOrder(next: string[]) {
    const previous = order;
    setOrder(next);
    setOrderError(null);
    setSavingOrder(true);
    try {
      const res = await fetch("/api/interview-questions/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Could not save the new order.");
      }
      router.refresh();
    } catch (caught) {
      // Put it back rather than show an order that is not what is saved.
      setOrder(previous);
      setOrderError(caught instanceof Error ? caught.message : "Could not save the new order.");
    } finally {
      setSavingOrder(false);
    }
  }

  /**
   * Move `id` to where `targetId` is. Works on the FULL order, so moving within
   * a filtered view only swaps the questions you can see past each other.
   * Active and inactive questions are kept apart (active always list first).
   */
  function moveTo(id: string, targetId: string) {
    if (id === targetId) return;
    const a = byId.get(id);
    const b = byId.get(targetId);
    if (!a || !b || a.isActive !== b.isActive) return;
    const from = order.indexOf(id);
    const to = order.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = order.filter((x) => x !== id);
    const at = next.indexOf(targetId);
    // Dragging down lands after the target, dragging up lands before it.
    next.splice(from < to ? at + 1 : at, 0, id);
    void saveOrder(next);
  }

  function neighbour(item: InterviewQuestionItem, step: -1 | 1): InterviewQuestionItem | null {
    const i = filtered.findIndex((q) => q.id === item.id);
    const other = filtered[i + step];
    return other && other.isActive === item.isActive ? other : null;
  }

  function onDragStart(e: DragEvent<HTMLElement>, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    const card = (e.currentTarget as HTMLElement).closest("[data-qid]");
    if (card instanceof HTMLElement) e.dataTransfer.setDragImage(card, 16, 16);
  }

  function onDrop(e: DragEvent<HTMLElement>, targetId: string) {
    e.preventDefault();
    const id = dragId ?? e.dataTransfer.getData("text/plain");
    setDragId(null);
    setOverId(null);
    if (id) moveTo(id, targetId);
  }

  const reorderBtn =
    "rounded p-0.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea disabled:opacity-25 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-white/10";

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview &amp; evaluation</p>
            <h1 className="mt-0.5 flex items-center gap-2 text-3xl font-semibold text-white">
              <ListChecks className="h-7 w-7" /> Question bank
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/75">
              A reusable library of interview questions, tagged by category, core values, and department — the source the
              interview-guide builder and scorecards draw from. Drag a question by its handle (or use the arrows) to set the
              order. Switch a question to <b className="text-white">Inactive</b> to keep it in the bank but leave it out of new
              guides and scorecards.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start">
            <button
              onClick={() => {
                setCreating(false);
                setEditingId(null);
                setImporting((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 rounded border border-white/40 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 hover:shadow-glow"
            >
              <FileUp className="h-4 w-4" /> Import from a document
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setCopyFrom(null);
                setCreating(true);
              }}
              className="inline-flex items-center gap-1.5 rounded bg-white px-4 py-2 text-sm font-semibold text-brand-lea shadow-sm transition hover:bg-brand-cloudDancer dark:bg-brand-panel dark:text-slate-100"
            >
              <Plus className="h-4 w-4" /> New question
            </button>
          </div>
        </div>
      </section>

      <InterviewTabs active="bank" />

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-2 rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions" className={`${inputCls} pl-9`} />
        </div>
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10 dark:bg-brand-panel dark:text-slate-100">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={fVal} onChange={(e) => setFVal(e.target.value)} className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10 dark:bg-brand-panel dark:text-slate-100">
          <option value="all">All values</option>
          {COMPANY_VALUES.map((v) => (
            <option key={v.colorKey} value={v.colorKey}>
              {v.name}
            </option>
          ))}
        </select>
        <select value={fDept} onChange={(e) => setFDept(e.target.value)} className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10 dark:bg-brand-panel dark:text-slate-100">
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

      {orderError ? (
        <p className="rounded bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{orderError}</p>
      ) : null}

      {notice ? (
        <p className="flex items-center justify-between gap-3 rounded bg-brand-sweet/20 px-3 py-2 text-xs font-medium text-brand-lea dark:bg-white/5 dark:text-slate-100">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
            Dismiss
          </button>
        </p>
      ) : null}

      {formatUndo ? (
        <p className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-lea/10 bg-white px-3 py-2 text-xs text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
          <span>
            Last formatting change: <b className="text-brand-lea dark:text-slate-100">{formatUndo.label}</b> on {formatUndo.count} question{formatUndo.count === 1 ? "" : "s"}.
          </span>
          <button type="button" onClick={undoFormat} className="rounded border border-brand-lea/20 px-2 py-0.5 font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100">
            Undo
          </button>
        </p>
      ) : null}

      {importing ? (
        <QuestionImport
          questions={questions}
          onClose={() => setImporting(false)}
          onDone={(message) => {
            setNotice(message);
            router.refresh();
          }}
        />
      ) : null}

      {creating ? (
        <QuestionForm
          key={copyFrom?.id ?? "new"}
          copyFrom={copyFrom ?? undefined}
          onCancel={() => {
            setCreating(false);
            setCopyFrom(null);
          }}
          onSaved={afterSave}
          onFormatApplied={onFormatApplied}
        />
      ) : null}

      {/* List */}
      <section className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded bg-white px-4 py-16 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70 dark:bg-white/5">
              <ListChecks className="h-5 w-5 text-brand-grey dark:text-slate-400" />
            </div>
            <div className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">{questions.length === 0 ? "No questions yet" : "No questions match"}</div>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              {questions.length === 0 ? "Add your first interview question to start the bank." : "Adjust or clear the filters above."}
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            if (editingId === item.id) {
              return <QuestionForm key={item.id} initial={item} onCancel={() => setEditingId(null)} onSaved={afterSave} onFormatApplied={onFormatApplied} />;
            }
            const up = neighbour(item, -1);
            const down = neighbour(item, 1);
            const dropTarget = dragId !== null && overId === item.id && dragId !== item.id && byId.get(dragId)?.isActive === item.isActive;
            return (
              <div
                key={item.id}
                data-qid={item.id}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  if (overId !== item.id) setOverId(item.id);
                }}
                onDragLeave={() => setOverId((cur) => (cur === item.id ? null : cur))}
                onDrop={(e) => onDrop(e, item.id)}
                className={`flex gap-2 rounded bg-white p-4 shadow-panel ring-1 dark:bg-brand-panel ${
                  dropTarget ? "ring-2 ring-brand-gold" : "ring-brand-lea/10 dark:ring-white/10"
                } ${item.isActive ? "" : "opacity-60"} ${dragId === item.id ? "opacity-40" : ""}`}
              >
                {/* Reorder handle + arrows */}
                <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
                  <button type="button" onClick={() => up && moveTo(item.id, up.id)} disabled={!up || savingOrder} title="Move up" aria-label="Move up" className={reorderBtn}>
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <span
                    draggable={!savingOrder}
                    onDragStart={(e) => onDragStart(e, item.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    title="Drag to reorder"
                    aria-hidden
                    className="cursor-grab text-brand-grey/70 hover:text-brand-lea active:cursor-grabbing dark:text-slate-500 dark:hover:text-slate-200"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <button type="button" onClick={() => down && moveTo(item.id, down.id)} disabled={!down || savingOrder} title="Move down" aria-label="Move down" className={reorderBtn}>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <RichTextView html={questionHtml(item.text)} className="min-w-0 font-medium !text-brand-black dark:!text-slate-100 [&_p:first-child]:mt-0" />
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => toggleActive(item)}
                        disabled={busyId === item.id}
                        aria-pressed={item.isActive}
                        title={item.isActive ? "Active — click to make inactive (kept in the bank, left out of new guides and scorecards)" : "Inactive — click to make active again"}
                        className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold transition hover:shadow-glow ${
                          item.isActive
                            ? "border-emerald-600/30 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300"
                            : "border-brand-lea/20 text-brand-grey dark:border-white/10 dark:text-slate-400"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${item.isActive ? "bg-emerald-600 dark:bg-emerald-400" : "bg-brand-grey/60"}`} />
                        {item.isActive ? "Active" : "Inactive"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setCopyFrom(item);
                          setCreating(true);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        title="Duplicate — a new question pre-filled with this one, formatting and all"
                        aria-label="Duplicate"
                        className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button onClick={() => { setCreating(false); setEditingId(item.id); }} title="Edit" className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => remove(item)} disabled={busyId === item.id} title="Delete" className="rounded p-1.5 text-brand-grey transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone="grey">{CATEGORY_LABELS[item.category] ?? item.category}</Badge>
                    {item.coreValues.map((v) => (
                      <Badge key={v} tone="gold">
                        {VALUE_NAME[v] ?? v}
                      </Badge>
                    ))}
                    {item.departments.map((d) => (
                      <Badge key={d}>{DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS] ?? d}</Badge>
                    ))}
                  </div>
                  <GuidanceBlocks strongAnswer={item.strongAnswer} listenFor={item.listenFor} />
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
