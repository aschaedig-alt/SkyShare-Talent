"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUp, X } from "lucide-react";
import type { InterviewQuestionItem } from "@/lib/data/interview-questions";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { DEPARTMENT_LABELS } from "@/lib/calendar/departments";
import { Button } from "@/components/ui";
import { RichTextView } from "@/components/richtext/RichTextEditor";
import { GuidanceBlocks } from "@/components/interview-questions/GuidanceBlocks";
import { questionPlain } from "@/lib/interview-questions/rich";

/**
 * "Upload a document of questions with the fields listed and you autofill them
 * following the same text formatting as the first question" — feedback
 * cmwcmsbwn (Nov 11 2026).
 *
 * Two steps, on purpose: READ shows what was found and writes nothing; ADD puts
 * the ticked ones at the end of the bank. Questions already in the bank word for
 * word start unticked. The last import can be undone from here.
 */

type Previewed = {
  text: string;
  category: string;
  coreValues: string[];
  departments: string[];
  strongAnswer: string;
  listenFor: string;
  duplicate: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  BEHAVIORAL: "Behavioral",
  SITUATIONAL: "Situational",
  TECHNICAL: "Technical",
  EXPERIENCE: "Experience",
  CULTURE: "Culture",
  GENERAL: "General",
  OTHER: "Other"
};
const VALUE_NAME: Record<string, string> = Object.fromEntries(COMPANY_VALUES.map((v) => [v.colorKey, v.name]));

const inputCls =
  "w-full rounded border border-brand-lea/20 px-3 py-2 text-sm outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const fieldLabel = "text-xs font-semibold text-brand-lea dark:text-slate-100";
const badge = "rounded px-2 py-0.5 text-[11px] font-semibold";

export function QuestionImport({
  questions,
  onClose,
  onDone
}: {
  questions: InterviewQuestionItem[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  // Default template: the first question in the bank, as she described it.
  const [templateId, setTemplateId] = useState(questions[0]?.id ?? "");
  const [reading, setReading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Previewed[] | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [undo, setUndo] = useState<{ at: string; count: number } | null>(null);

  const loadUndo = useCallback(async () => {
    try {
      const res = await fetch("/api/interview-questions/import");
      const body = (await res.json()) as { undo: { at: string; count: number } | null };
      setUndo(body.undo);
    } catch {
      /* optional */
    }
  }, []);
  useEffect(() => {
    void loadUndo();
  }, [loadUndo]);

  async function read() {
    setReading(true);
    setError(null);
    setFound(null);
    try {
      const form = new FormData();
      if (file) form.append("file", file);
      else form.append("text", pasted);
      if (templateId) form.append("templateId", templateId);
      const res = await fetch("/api/interview-questions/import", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { message?: string; questions?: Previewed[] };
      if (!res.ok) throw new Error(body.message ?? "Could not read that document.");
      const list = body.questions ?? [];
      if (list.length === 0) throw new Error("No interview questions were found in that document.");
      setFound(list);
      setPicked(list.map((q) => !q.duplicate));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that document.");
    } finally {
      setReading(false);
    }
  }

  async function add() {
    if (!found) return;
    const chosen = found.filter((_q, i) => picked[i]);
    if (chosen.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/interview-questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          questions: chosen.map(({ text, category, coreValues, departments, strongAnswer, listenFor }) => ({ text, category, coreValues, departments, strongAnswer, listenFor }))
        })
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; created?: number };
      if (!res.ok) throw new Error(body.message ?? "Could not add the questions.");
      onDone(`${body.created} question${body.created === 1 ? "" : "s"} added to the end of the bank. Undo is in the import panel.`);
      setFound(null);
      setFile(null);
      setPasted("");
      void loadUndo();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the questions.");
    } finally {
      setAdding(false);
    }
  }

  async function undoImport() {
    if (!undo || !window.confirm(`Remove the ${undo.count} question${undo.count === 1 ? "" : "s"} from the last import? Any edited since are kept.`)) return;
    const res = await fetch("/api/interview-questions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "undo" })
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string; removed?: number; kept?: number };
    onDone(res.ok ? `Import undone: ${body.removed} removed${body.kept ? `, ${body.kept} edited since kept` : ""}.` : body.message ?? "Could not undo the import.");
    void loadUndo();
  }

  const chosenCount = picked.filter(Boolean).length;

  return (
    <section className="rounded border border-brand-gold/30 bg-brand-gold/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-brand-lea dark:text-slate-100">
            <FileUp className="h-4 w-4" /> Import questions from a document
          </h2>
          <p className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">
            A Word (.docx), PDF or text file — or paste the text of a Google Doc. Each question is split into its question,
            category, core values, Strong answer and Listen for, word for word. Nothing is added until you review it.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close import" className="rounded p-1 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>

      {undo ? (
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-brand-lea/10 bg-white px-3 py-2 text-xs text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
          <span>
            Last import: {undo.count} question{undo.count === 1 ? "" : "s"} on {new Date(undo.at).toLocaleString()}.
          </span>
          <button type="button" onClick={undoImport} className="rounded border border-brand-lea/20 px-2 py-0.5 font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100">
            Undo that import
          </button>
        </p>
      ) : null}

      {found === null ? (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-1">
            <span className={fieldLabel}>Document</span>
            <input
              type="file"
              accept=".docx,.pdf,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-brand-lea file:mr-3 file:rounded file:border file:border-brand-lea/20 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-lea dark:text-slate-100 dark:file:border-white/10 dark:file:bg-brand-panel dark:file:text-slate-100"
            />
          </div>
          {!file ? (
            <label className={`grid gap-1 ${fieldLabel}`}>
              …or paste the questions
              <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} placeholder="Paste the document's text here" className={inputCls} />
            </label>
          ) : null}
          <label className={`grid gap-1 ${fieldLabel}`}>
            Format them like
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
              <option value="">— No formatting (plain text) —</option>
              {questions.map((q, i) => (
                <option key={q.id} value={q.id}>
                  {i === 0 ? "First question: " : ""}
                  {questionPlain(q.text).slice(0, 90)}
                </option>
              ))}
            </select>
            <span className="text-[11px] font-normal text-brand-grey dark:text-slate-400">
              Each box copies that question&apos;s box: size, colour, and bold or italics when the whole box has them.
            </span>
          </label>
          {error ? <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p> : null}
          <div className="flex justify-end">
            <Button onClick={read} disabled={reading || (!file && !pasted.trim())}>
              {reading ? "Reading the document…" : "Read document"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brand-grey dark:text-slate-400">
            <span>
              Found {found.length} question{found.length === 1 ? "" : "s"}
              {found.some((q) => q.duplicate) ? ` — ${found.filter((q) => q.duplicate).length} already in the bank, left unticked` : ""}. Untick any you don&apos;t want.
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setPicked(found.map(() => true))} className="font-semibold text-brand-eden hover:text-brand-lea dark:text-brand-sweet">
                Tick all
              </button>
              <button type="button" onClick={() => setPicked(found.map(() => false))} className="font-semibold text-brand-eden hover:text-brand-lea dark:text-brand-sweet">
                Untick all
              </button>
            </span>
          </div>
          {found.map((q, i) => (
            <label
              key={i}
              className={`flex gap-3 rounded bg-white p-3 shadow-panel ring-1 dark:bg-brand-panel ${picked[i] ? "ring-brand-lea/10 dark:ring-white/10" : "opacity-60 ring-transparent"}`}
            >
              <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((cur) => cur.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1" />
              <div className="min-w-0 flex-1">
                <RichTextView html={q.text} className="min-w-0 font-medium !text-brand-black dark:!text-slate-100 [&_p:first-child]:mt-0" />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className={`${badge} bg-brand-cloudDancer/70 text-brand-grey dark:bg-white/5 dark:text-slate-400`}>{CATEGORY_LABELS[q.category] ?? q.category}</span>
                  {q.coreValues.map((v) => (
                    <span key={v} className={`${badge} bg-brand-gold/20 text-brand-lea dark:text-slate-100`}>
                      {VALUE_NAME[v] ?? v}
                    </span>
                  ))}
                  {q.departments.map((d) => (
                    <span key={d} className={`${badge} bg-brand-sweet/25 text-brand-lea dark:text-slate-100`}>
                      {DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS] ?? d}
                    </span>
                  ))}
                  {q.duplicate ? <span className={`${badge} bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300`}>Already in the bank</span> : null}
                </div>
                <GuidanceBlocks strongAnswer={q.strongAnswer} listenFor={q.listenFor} />
              </div>
            </label>
          ))}
          {error ? <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p> : null}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => setFound(null)} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
              Back
            </button>
            <Button onClick={add} disabled={adding || chosenCount === 0}>
              {adding ? "Adding…" : `Add ${chosenCount} question${chosenCount === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
