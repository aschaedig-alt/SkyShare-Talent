"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wand2, Copy, Check, ChevronUp, ChevronDown, X, Search, Save, ListChecks, Shuffle } from "lucide-react";
import type { InterviewQuestionItem } from "@/lib/data/interview-questions";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/calendar/departments";
import { InterviewTabs } from "@/components/interview-questions/InterviewTabs";
import { Button } from "@/components/ui";
import { RichTextView } from "@/components/richtext/RichTextEditor";
import { questionHtml, questionPlain } from "@/lib/interview-questions/rich";
import { GuidanceBlocks } from "@/components/interview-questions/GuidanceBlocks";
import { CoreValueTally } from "@/components/interview-guides/CoreValueTally";
import { CONTROL_CLS, FIELD_CLS, FIELD_LABEL_CLS, type PickedCandidate } from "@/components/interview-guides/GuideLinkPicker";

// Build an interview guide — rebuilt Nov 16 2026 after he ran a pilot interview
// with it. What he asked for:
//   - select each question he wants (here, or ticked in the question bank);
//   - keep "generate random", but say HOW MANY in an open number box (1 up to
//     however many active questions there are), not a fixed 5/8/10/12/15 list;
//   - save the guide for that interview, linked to the candidate, so answers
//     can be typed in against each question (the guide page) and the guide
//     shows on the candidate's interview.
//
// Reworked the same evening after Aimee asked for it (feedback, Nov 16 2026):
//   "i save a guide then i choose which guide i want to add to the interview."
// So saving here makes a SAVED guide (reusable, on nobody), and the same
// builder edits one (the editing prop). Arriving from an interview still lets
// you add a one-off straight to it, or save it and add it in one go.

export const CATEGORY_LABELS: Record<string, string> = {
  BEHAVIORAL: "Behavioral",
  SITUATIONAL: "Situational",
  TECHNICAL: "Technical",
  EXPERIENCE: "Experience",
  CULTURE: "Culture",
  GENERAL: "General",
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

/**
 * A balanced random draw: an even share from each chosen core value first, then
 * other questions tagged with a chosen value, then anything. Unchanged from the
 * original generator, apart from taking a count and skipping questions already
 * on the guide.
 */
function draw(available: InterviewQuestionItem[], values: Set<string>, count: number): InterviewQuestionItem[] {
  const picked: InterviewQuestionItem[] = [];
  const used = new Set<string>();
  if (values.size > 0) {
    const valueList = [...values];
    const perValue = Math.max(1, Math.floor(count / valueList.length));
    for (const v of valueList) {
      for (const q of shuffle(available.filter((q) => q.coreValues.includes(v) && !used.has(q.id))).slice(0, perValue)) {
        if (picked.length >= count) break;
        picked.push(q);
        used.add(q.id);
      }
    }
    const prefer = shuffle(available.filter((q) => !used.has(q.id) && q.coreValues.some((v) => values.has(v))));
    const rest = shuffle(available.filter((q) => !used.has(q.id) && !q.coreValues.some((v) => values.has(v))));
    for (const q of [...prefer, ...rest]) {
      if (picked.length >= count) break;
      picked.push(q);
      used.add(q.id);
    }
    return picked;
  }
  return shuffle(available).slice(0, count);
}

const inputCls =
  "w-full rounded border border-brand-lea/20 px-3 py-2 text-sm outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const panelCls = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const headCls = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-sweet";
const selectBtnCls =
  "rounded border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow disabled:cursor-default disabled:opacity-40 disabled:hover:shadow-none dark:border-white/10 dark:text-slate-100";
const chipCls = (on: boolean) =>
  `rounded border px-3 py-1 text-xs font-semibold transition hover:shadow-glow ${
    on ? "border-brand-gold bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
  }`;

export function GuideBuilder({
  questions,
  initialPick = [],
  initialCandidate = null,
  initialInterviewId = null,
  editing = null,
  top = null
}: {
  questions: InterviewQuestionItem[];
  /** Question ids ticked in the question bank (?q=). */
  initialPick?: string[];
  /** Arriving from an interview's "Build a guide" link. */
  initialCandidate?: PickedCandidate | null;
  initialInterviewId?: string | null;
  /** Editing an existing SAVED guide rather than making a new one. */
  editing?: { id: string; title: string; departmentKey: string | null } | null;
  /** Shown under the tabs (the saved guide's "Use for an interview" panel). */
  top?: ReactNode;
}) {
  const router = useRouter();
  const active = useMemo(() => questions.filter((q) => q.isActive), [questions]);
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const [picked, setPicked] = useState<string[]>(() => [...new Set(initialPick)].filter((id) => byId.has(id)));
  const [dept, setDept] = useState(editing?.departmentKey ?? "all");
  const [values, setValues] = useState<Set<string>>(new Set());
  const [countText, setCountText] = useState("8");
  const [search, setSearch] = useState("");
  const [shortNote, setShortNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Only set when you arrived from an interview's "Build a new guide" link.
  const candidate: PickedCandidate | null = !editing && initialInterviewId ? initialCandidate : null;
  const interviewId = candidate ? initialInterviewId : null;
  const [interviewer, setInterviewer] = useState("");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const pickedSet = new Set(picked);
  const guide = picked.map((id) => byId.get(id)).filter((q): q is InterviewQuestionItem => Boolean(q));

  // Questions with no department tag apply to every department.
  const pool = dept === "all" ? active : active.filter((q) => q.departments.length === 0 || q.departments.includes(dept));
  const notYetPicked = pool.filter((q) => !pickedSet.has(q.id));

  const count = /^\s*\d+\s*$/.test(countText) ? Number(countText) : NaN;
  const countError =
    countText.trim() === ""
      ? "Type how many questions."
      : !Number.isInteger(count) || count < 1
        ? "Use a whole number, 1 or more."
        : count > pool.length
          ? `There are only ${pool.length} active question${pool.length === 1 ? "" : "s"}${dept === "all" ? "" : " for this department"}.`
          : null;

  function toggleValue(key: string) {
    setValues((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function generate(mode: "replace" | "add") {
    if (countError) return;
    const from = mode === "replace" ? pool : notYetPicked;
    const got = draw(from, values, count);
    setPicked((cur) => (mode === "replace" ? got.map((q) => q.id) : [...cur, ...got.map((q) => q.id)]));
    setShortNote(got.length < count ? `Only ${got.length} more matching question${got.length === 1 ? "" : "s"} available — added ${got.length === 0 ? "none" : "them all"}.` : null);
    setCopied(false);
  }

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setCopied(false);
  }

  function move(id: string, step: -1 | 1) {
    setPicked((cur) => {
      const i = cur.indexOf(id);
      const j = i + step;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function copyGuide() {
    if (guide.length === 0) return;
    const deptLabel = dept === "all" ? "All departments" : DEPARTMENT_LABELS[dept as keyof typeof DEPARTMENT_LABELS];
    let text = `Interview Guide — ${candidate?.displayName ?? deptLabel}\n\n`;
    guide.forEach((q, i) => {
      text += `${i + 1}. ${questionPlain(q.text)}\n`;
      if (q.strongAnswer) text += `   Strong answer: ${questionPlain(q.strongAnswer)}\n`;
      if (q.listenFor) text += `   Listen for: ${questionPlain(q.listenFor)}\n`;
      text += "\n";
    });
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function send(url: string, method: "POST" | "PUT", body: unknown): Promise<{ id?: string }> {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(out.message ?? "Could not save the guide.");
    return out;
  }

  /**
   *   "saved"      a new SAVED guide (reusable), then open it
   *   "saved+use"  a new saved guide, then use it for the interview you came from
   *   "once"       straight onto the interview you came from, nothing saved
   *   "edit"       save changes to the saved guide being edited
   */
  async function save(kind: "saved" | "saved+use" | "once" | "edit") {
    const name = title.trim();
    if (kind !== "once" && !name) {
      setSaveError("Give the guide a name, so you can pick it for an interview later.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSavedNote(null);
    const departmentKey = dept === "all" ? null : dept;
    try {
      if (kind === "edit" && editing) {
        await send(`/api/interview-guides/${editing.id}/questions`, "PUT", { questionIds: picked, title: name, departmentKey });
        setSavedNote("Saved. Interviews it was already used for keep the questions they had.");
        setSaving(false);
        router.refresh();
        return;
      }
      if (kind === "once") {
        const out = await send("/api/interview-guides", "POST", {
          questionIds: picked,
          candidateId: candidate?.id ?? null,
          interviewId,
          interviewer: interviewer.trim() || null,
          title: name || undefined,
          departmentKey
        });
        router.push(`/interview-questions/guides/${out.id}`);
        return;
      }
      const made = await send("/api/interview-guides", "POST", { questionIds: picked, title: name, departmentKey, asTemplate: true });
      if (kind === "saved+use") {
        const used = await send(`/api/interview-guides/${made.id}/use`, "POST", {
          candidateId: candidate?.id ?? null,
          interviewId,
          interviewer: interviewer.trim() || null
        });
        router.push(`/interview-questions/guides/${used.id}`);
        return;
      }
      router.push(`/interview-questions/guides/${made.id}`);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save the guide.");
      setSaving(false);
    }
  }

  const q = search.trim().toLowerCase();
  const bankList = q ? pool.filter((x) => questionPlain(x.text).toLowerCase().includes(q)) : pool;

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5 lg:px-8">
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview &amp; evaluation</p>
        <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-semibold text-white sm:text-3xl">
          <Wand2 className="h-7 w-7 shrink-0" /> {editing ? `Edit ${editing.title}` : "Build an interview guide"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          {editing
            ? "Add, remove or reorder questions, or rename the guide. Interviews it was already used for keep the questions they had."
            : "Pick the questions you want, generate a random set, or both. Save it as a guide, then pick it for each interview."}
        </p>
      </section>

      <InterviewTabs active={editing ? "saved" : "guide"} />

      {top}

      {/* Coverage of the four core values by what is picked. Stays in view while
          ticking down the bank on a computer; on a phone it scrolls with the
          page rather than covering half the screen. */}
      <div className="z-20 lg:sticky lg:top-3">
        <CoreValueTally questions={guide} label={`Core values in this guide · ${guide.length} question${guide.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
        {/* LEFT: ways to add questions */}
        <div className="space-y-5">
          <section className={panelCls}>
            <h2 className={`${headCls} flex items-center gap-1.5`}>
              <Shuffle className="h-3.5 w-3.5" /> Generate random questions
            </h2>
            {/* Same field styles as the save section, and the hint sits UNDER the
                row rather than inside one box: as a grid cell with an extra line,
                the count box stretched the Department box out of line (his
                feedback Nov 16 2026). */}
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <label className={FIELD_CLS}>
                <span className={FIELD_LABEL_CLS}>Department</span>
                <select value={dept} onChange={(e) => setDept(e.target.value)} className={CONTROL_CLS}>
                  <option value="all">All departments</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD_CLS}>
                <span className={FIELD_LABEL_CLS}>How many questions</span>
                <input
                  value={countText}
                  onChange={(e) => setCountText(e.target.value)}
                  inputMode="numeric"
                  aria-invalid={Boolean(countError)}
                  className={`${CONTROL_CLS} ${countError ? "border-red-500 dark:border-red-400" : ""}`}
                />
              </label>
            </div>
            <p className={`mt-1.5 text-xs ${countError ? "font-medium text-red-700 dark:text-red-300" : "text-brand-grey dark:text-slate-400"}`}>
              {countError ?? `How many: any number from 1 to ${pool.length} (active questions${dept === "all" ? "" : " for this department"}).`}
            </p>
            <div className="mt-3">
              <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">Core values to cover</span>
              <p className="mb-1.5 text-[11px] text-brand-grey dark:text-slate-400">Leave empty to draw from all values.</p>
              <div className="flex flex-wrap gap-1.5">
                {COMPANY_VALUES.map((v) => (
                  <button key={v.colorKey} type="button" onClick={() => toggleValue(v.colorKey)} className={chipCls(values.has(v.colorKey))}>
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => generate("replace")} disabled={Boolean(countError)}>
                <Wand2 className="h-4 w-4" /> {guide.length ? "Replace with a random set" : "Generate random set"}
              </Button>
              {guide.length ? (
                <button
                  type="button"
                  onClick={() => generate("add")}
                  disabled={Boolean(countError)}
                  className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:shadow-glow disabled:opacity-50 dark:border-white/10 dark:text-slate-100"
                >
                  Add {Number.isInteger(count) && count > 0 ? count : ""} more at random
                </button>
              ) : null}
            </div>
            {shortNote ? <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{shortNote}</p> : null}
          </section>

          <section className={panelCls}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={`${headCls} flex items-center gap-1.5`}>
                <ListChecks className="h-3.5 w-3.5" /> Pick from the bank
              </h2>
              <span className="text-xs text-brand-grey dark:text-slate-400">
                {pool.length} active{dept === "all" ? "" : ` for ${DEPARTMENT_LABELS[dept as keyof typeof DEPARTMENT_LABELS]}`}
              </span>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions" className={`${inputCls} pl-9`} />
            </div>
            {/* Select all / Unselect all act on the questions LISTED (after the
                department and search filters), and keep the guide's order. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPicked((cur) => [...cur, ...bankList.map((x) => x.id).filter((id) => !cur.includes(id))])}
                disabled={bankList.every((x) => pickedSet.has(x.id))}
                className={selectBtnCls}
              >
                Select all{q ? " shown" : ""}
              </button>
              <button
                type="button"
                onClick={() => {
                  const listed = new Set(bankList.map((x) => x.id));
                  setPicked((cur) => cur.filter((id) => !listed.has(id)));
                }}
                disabled={!bankList.some((x) => pickedSet.has(x.id))}
                className={selectBtnCls}
              >
                Unselect all{q ? " shown" : ""}
              </button>
              <span className="text-xs text-brand-grey dark:text-slate-400">
                {bankList.filter((x) => pickedSet.has(x.id)).length} of {bankList.length} selected
              </span>
            </div>
            <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
              {bankList.map((item) => {
                const on = pickedSet.has(item.id);
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-3 py-2.5">
                      <input type="checkbox" checked={on} onChange={() => toggle(item.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#0d2c43]" />
                      <span className="min-w-0 flex-1">
                        <RichTextView html={questionHtml(item.text)} className="!text-sm !text-brand-black dark:!text-slate-100 [&_p:first-child]:mt-0" />
                        <span className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded bg-brand-cloudDancer/70 px-1.5 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </span>
                          {item.coreValues.filter((v) => VALUE_NAME[v]).map((v) => (
                            <span key={v} className="rounded border border-brand-gold/40 px-1.5 py-0.5 text-[10px] font-semibold text-brand-lea dark:text-slate-200">
                              {VALUE_NAME[v]}
                            </span>
                          ))}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {bankList.length === 0 ? <li className="py-4 text-center text-sm text-brand-grey dark:text-slate-400">No active questions match.</li> : null}
            </ul>
          </section>
        </div>

        {/* RIGHT: the guide itself, then where to save it */}
        <div className="space-y-5">
          <section className={panelCls}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={headCls}>This guide · {guide.length} question{guide.length === 1 ? "" : "s"}</h2>
              {guide.length ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={copyGuide} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                  </button>
                  <button type="button" onClick={() => setPicked([])} className="rounded px-2 py-1 text-xs font-semibold text-brand-grey transition hover:text-red-600 dark:text-slate-400">
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
            {guide.length === 0 ? (
              <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
                No questions yet. Generate a random set, tick questions under Pick from the bank, or tick them on the{" "}
                <Link href="/interview-questions" className="font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100">
                  Question bank
                </Link>{" "}
                and press Build guide.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {guide.map((item, i) => (
                  <li key={item.id} className="flex gap-2 rounded border border-brand-lea/10 p-3 dark:border-white/10">
                    <div className="flex shrink-0 flex-col items-center">
                      <button type="button" onClick={() => move(item.id, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-0.5 text-brand-grey transition hover:text-brand-lea disabled:opacity-25 dark:text-slate-400">
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <span className="text-xs font-semibold text-brand-grey dark:text-slate-400">{i + 1}</span>
                      <button type="button" onClick={() => move(item.id, 1)} disabled={i === guide.length - 1} aria-label="Move down" className="rounded p-0.5 text-brand-grey transition hover:text-brand-lea disabled:opacity-25 dark:text-slate-400">
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <RichTextView html={questionHtml(item.text)} className="!text-brand-black dark:!text-slate-100 [&_p:first-child]:mt-0" />
                      <span className="rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                      <GuidanceBlocks strongAnswer={item.strongAnswer} listenFor={item.listenFor} />
                    </div>
                    <button type="button" onClick={() => toggle(item.id)} aria-label="Remove from guide" title="Remove from guide" className="h-fit shrink-0 rounded p-1 text-brand-grey transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={panelCls}>
            <h2 className={`${headCls} flex items-center gap-1.5`}>
              <Save className="h-3.5 w-3.5" /> {editing ? "Save changes" : candidate ? `For ${candidate.displayName}'s interview` : "Save guide"}
            </h2>
            <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
              {editing
                ? "Each time the guide is used, its questions are copied fresh from the bank, so a wording fixed in the bank is what gets asked."
                : candidate
                  ? "Add these questions to this interview only, or also keep them as a saved guide to pick for later interviews."
                  : "A saved guide is a set of questions you keep. Pick it for an interview from the interview itself or from the guide's page; each interview gets its own copy to type answers into."}
            </p>
            {/* One grid, two even columns (stacked on a phone). */}
            <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
              <label className={FIELD_CLS}>
                <span className={FIELD_LABEL_CLS}>Guide name</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pilot phone screen" className={CONTROL_CLS} />
              </label>
              {candidate ? (
                <label className={FIELD_CLS}>
                  <span className={FIELD_LABEL_CLS}>Interviewer</span>
                  <input value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="Defaults to you" className={CONTROL_CLS} />
                </label>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-brand-lea/10 pt-4 dark:border-white/10">
              {editing ? (
                <Button onClick={() => void save("edit")} disabled={saving || guide.length === 0}>
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
                </Button>
              ) : candidate ? (
                <>
                  <Button onClick={() => void save("once")} disabled={saving || guide.length === 0}>
                    <Save className="h-4 w-4" /> {saving ? "Saving…" : "Add to this interview"}
                  </Button>
                  <Button variant="secondary" onClick={() => void save("saved+use")} disabled={saving || guide.length === 0}>
                    Save as a guide and add
                  </Button>
                </>
              ) : (
                <Button onClick={() => void save("saved")} disabled={saving || guide.length === 0}>
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save guide"}
                </Button>
              )}
              {savedNote ? <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{savedNote}</span> : null}
              {saveError ? <span className="text-xs font-medium text-red-700 dark:text-red-300">{saveError}</span> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
