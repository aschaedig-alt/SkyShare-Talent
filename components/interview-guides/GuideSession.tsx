"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Trash2, Link2, Eye, EyeOff, Star, Check, Plus, FileText } from "lucide-react";
import type { GuideItemView, GuideView } from "@/lib/data/interview-guides";
import type { InterviewDetail } from "@/lib/data/interview-detail";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { RichTextView } from "@/components/richtext/RichTextEditor";
import { RichNoteField } from "@/components/richtext/RichNoteField";
import { GuidanceBlocks } from "@/components/interview-questions/GuidanceBlocks";
import { InterviewTabs } from "@/components/interview-questions/InterviewTabs";
import { CATEGORY_LABELS } from "@/components/interview-questions/GuideBuilder";
import { InterviewScorecards } from "@/components/interviews/InterviewDetailWorkspace";
import { CoreValueChart } from "@/components/interview-guides/CoreValueChart";
import { LearnedPanel } from "@/components/interview-guides/LearnedPanel";
import { splitValues, VALUE_KEYS } from "@/lib/interview-guides/values";
import { GuideLinkPicker, LINK_HINT, type PickedCandidate } from "@/components/interview-guides/GuideLinkPicker";
import { TranscriptFillModal } from "@/components/interview-guides/TranscriptFillModal";
import { Button } from "@/components/ui";
import { questionHtml } from "@/lib/interview-questions/rich";
import { formatDateTimeWithZone } from "@/lib/calendar/format";
import { ANSWER_STRENGTHS, STRENGTH_HINT, STRENGTH_LABEL, strengthTone, type AnswerStrength } from "@/lib/interview-guides/constants";

// The guide in use: ask each question, type what the candidate said, get a
// draft judgement of the answer, and rate the four core values on the
// interview's scorecard underneath (Nov 16 2026).

const VALUE_NAME: Record<string, string> = Object.fromEntries(COMPANY_VALUES.map((v) => [v.colorKey, v.name]));
const panelCls = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const headCls = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-sweet";

type SaveState = "idle" | "saving" | "saved" | "error";

function QuestionCard({
  guideId,
  item,
  index,
  showGuidance,
  onSaved
}: {
  guideId: string;
  item: GuideItemView;
  index: number;
  showGuidance: boolean;
  onSaved: (next: Partial<GuideItemView> & { id: string }) => void;
}) {
  const [answer, setAnswer] = useState(item.answer ?? "");
  const latest = useRef(answer);
  const savedValue = useRef(item.answer ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // A fresh copy from the server (after Evaluate) must not wipe what is being typed.
  useEffect(() => {
    if (latest.current === savedValue.current) {
      setAnswer(item.answer ?? "");
      latest.current = item.answer ?? "";
    }
    savedValue.current = item.answer ?? "";
  }, [item.answer]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setState("saving");
    setError(null);
    try {
      const res = await fetch(`/api/interview-guides/${guideId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const out = (await res.json().catch(() => ({}))) as { message?: string; item?: Partial<GuideItemView> & { id: string } };
      if (!res.ok || !out.item) throw new Error(out.message ?? "Could not save.");
      if ("answer" in body) savedValue.current = out.item.answer ?? "";
      onSaved(out.item);
      setState("saved");
      return true;
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "Could not save.");
      return false;
    }
  }

  function commitAnswer() {
    if (latest.current === savedValue.current) return;
    void patch({ answer: latest.current });
  }

  function toggleValue(key: string) {
    const next = item.values.includes(key) ? item.values.filter((k) => k !== key) : [...item.values, key];
    // Shown at once; put back if the save fails, so the page never shows a
    // tick that is not saved.
    const before = { values: item.values, shownValues: item.shownValues, removedValues: item.removedValues, valuesSource: item.valuesSource, valuesNote: item.valuesNote };
    const { shown, removed } = splitValues(item.coreValues, next);
    onSaved({ id: item.id, values: VALUE_KEYS.filter((k) => next.includes(k)), shownValues: shown, removedValues: removed, valuesSource: "INTERVIEWER", valuesNote: null });
    void patch({ values: next }).then((ok) => {
      if (!ok) onSaved({ id: item.id, ...before });
    });
  }

  function setStrength(s: AnswerStrength) {
    const next = item.strength === s && item.evaluationSource === "INTERVIEWER" ? null : s;
    void patch({ strength: next });
  }

  const dirty = answer !== savedValue.current;

  return (
    <li className={panelCls}>
      <div className="flex gap-2">
        <span className="shrink-0 text-sm font-semibold text-brand-grey dark:text-slate-400">{index + 1}.</span>
        <div className="min-w-0 flex-1">
          <RichTextView html={questionHtml(item.text)} className="font-medium !text-brand-black dark:!text-slate-100 [&_p:first-child]:mt-0" />
          <div className="mt-1 flex flex-wrap gap-1">
            {item.category ? (
              <span className="rounded bg-brand-cloudDancer/70 px-1.5 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
                {CATEGORY_LABELS[item.category] ?? item.category}
              </span>
            ) : null}
            {item.coreValues.filter((v) => VALUE_NAME[v]).map((v) => (
              <span key={v} className="rounded border border-brand-gold/40 px-1.5 py-0.5 text-[10px] font-semibold text-brand-lea dark:text-slate-200">
                {VALUE_NAME[v]}
              </span>
            ))}
          </div>
          {showGuidance ? <GuidanceBlocks strongAnswer={item.strongAnswer} listenFor={item.listenFor} /> : null}

          <RichNoteField
            className="mt-3"
            label="Their answer"
            labelClassName="text-xs font-semibold text-brand-lea dark:text-slate-100"
            value={answer}
            onChange={(html) => {
              latest.current = html;
              setAnswer(html);
              if (state !== "saving") setState("idle");
            }}
            onCommit={commitAnswer}
            placeholder="What they said. Saves when you click away."
            minHeight={70}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            {dirty ? (
              <button type="button" onClick={commitAnswer} className="rounded border border-brand-lea/20 px-2 py-0.5 font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100">
                Save answer
              </button>
            ) : null}
            <span className={state === "error" ? "text-red-700 dark:text-red-300" : "text-brand-grey dark:text-slate-400"}>
              {state === "saving" ? "Saving…" : state === "saved" && !dirty ? "Saved" : state === "error" ? error : dirty ? "Not saved yet" : ""}
            </span>
          </div>

          {/* The four values as chips (his pick, Nov 16 2026). Every chip
              toggles: the question's own values start ticked and can be
              unticked ("asked, not shown"); any other can be ticked ("also
              showed"). The draft evaluator can set them too, marked as its
              suggestion until he changes one. */}
          <div className="mt-3">
            <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">Values this answer showed</span>
            <span className="ml-1.5 text-[11px] text-brand-grey dark:text-slate-400">tap to change</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {COMPANY_VALUES.map((v) => {
                const asked = item.coreValues.includes(v.colorKey);
                const on = item.values.includes(v.colorKey);
                const label = asked ? (on ? "asked" : "asked, not shown") : on ? "also showed" : null;
                const cls = on
                  ? asked
                    ? "border-brand-gold/70 bg-brand-gold/15 text-brand-lea dark:text-slate-100"
                    : "border-brand-gold bg-brand-lea text-white"
                  : asked
                    ? "border-dashed border-brand-lea/30 text-brand-grey dark:border-white/20 dark:text-slate-500"
                    : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400";
                return (
                  <button
                    key={v.colorKey}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleValue(v.colorKey)}
                    title={
                      on
                        ? "Untick: the answer did not show this value"
                        : asked
                          ? "Tick again: the answer did show this value"
                          : "Tick: the answer showed this value too"
                    }
                    className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition hover:shadow-glow ${cls}`}
                  >
                    {on ? <Check className="mr-1 inline h-3 w-3 align-[-1px]" /> : <Plus className="mr-1 inline h-3 w-3 align-[-1px]" />}
                    <span className={!on && asked ? "line-through" : undefined}>{v.name}</span>
                    {label ? (
                      <span className={`font-normal no-underline ${on && !asked ? "text-white/75" : "text-brand-grey dark:text-slate-400"}`}> · {label}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {item.valuesSource === "AI" ? (
              <p className="mt-1.5 text-[11px] text-brand-grey dark:text-slate-400">
                <Sparkles className="mr-1 inline h-3 w-3 align-[-1px] text-brand-eden dark:text-brand-sweet" />
                <span className="font-semibold text-brand-eden dark:text-brand-sweet">Draft suggestion</span>
                {item.valuesNote ? ` — ${item.valuesNote}` : ""} Tap a value to change it; the evaluator learns from what you change.
              </p>
            ) : null}
          </div>

          <div className="mt-3">
            <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">How was the answer?</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ANSWER_STRENGTHS.map((s) => {
                const on = item.strength === s;
                return (
                  <button
                    key={s}
                    type="button"
                    title={STRENGTH_HINT[s]}
                    onClick={() => setStrength(s)}
                    className={`rounded border px-2.5 py-0.5 text-[11px] font-semibold transition hover:shadow-glow ${
                      on
                        ? item.evaluationSource === "INTERVIEWER"
                          ? "border-brand-gold bg-brand-lea text-white"
                          : `border-transparent ${strengthTone(s)}`
                        : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                    }`}
                  >
                    {STRENGTH_LABEL[s]}
                  </button>
                );
              })}
            </div>
            {item.strength ? (
              <p className="mt-1.5 text-[11px] text-brand-grey dark:text-slate-400">
                {item.evaluationSource === "AI" ? (
                  <>
                    <span className="font-semibold text-brand-eden dark:text-brand-sweet">Draft suggestion</span>
                    {item.evaluationNote ? ` — ${item.evaluationNote}` : ""} Click a rating to set your own; the evaluator learns from what you change.
                  </>
                ) : (
                  <span className="font-semibold text-brand-lea dark:text-slate-100">Your rating. The draft evaluator leaves it alone.</span>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function CoreValuesPanel({ interviewId }: { interviewId: string }) {
  const [detail, setDetail] = useState<InterviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/interviews/${interviewId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load the interview's scorecards.");
      setDetail((await res.json()) as InterviewDetail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the interview's scorecards.");
    }
  }, [interviewId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <p className="text-sm text-red-700 dark:text-red-300">{error}</p>;
  if (!detail) return <p className="text-sm text-brand-grey dark:text-slate-400">Loading scorecards…</p>;
  return <InterviewScorecards detail={detail} onChanged={() => void load()} />;
}

export function GuideSession({ initial }: { initial: GuideView }) {
  const router = useRouter();
  const [guide, setGuide] = useState(initial);
  const [showGuidance, setShowGuidance] = useState(true);
  const [linking, setLinking] = useState(!initial.interview);
  const [pickCandidate, setPickCandidate] = useState<PickedCandidate | null>(initial.candidate);
  const [pickInterview, setPickInterview] = useState<string | null>(initial.interview?.id ?? null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalMessage, setEvalMessage] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  // Bumped on every save, so the "what it has learned" count re-reads after a
  // correction is recorded.
  const [learnTick, setLearnTick] = useState(0);

  const answered = guide.items.filter((i) => (i.answer ?? "").replace(/<[^>]*>/g, "").trim()).length;

  function onItemSaved(next: Partial<GuideItemView> & { id: string }) {
    setGuide((g) => ({ ...g, items: g.items.map((it) => (it.id === next.id ? { ...it, ...next } : it)) }));
    setLearnTick((n) => n + 1);
  }

  async function saveLink() {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/interview-guides/${guide.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: pickCandidate?.id ?? null, interviewId: pickInterview })
      });
      const out = (await res.json().catch(() => ({}))) as { message?: string; guide?: GuideView };
      if (!res.ok || !out.guide) throw new Error(out.message ?? "Could not link the guide.");
      setGuide(out.guide);
      setLinking(!out.guide.interview);
    } catch (caught) {
      setLinkError(caught instanceof Error ? caught.message : "Could not link the guide.");
    } finally {
      setLinkBusy(false);
    }
  }

  const draftRatings = guide.items.filter((i) => i.evaluationSource === "AI").length;
  const draftValues = guide.items.filter((i) => i.valuesSource === "AI").length;
  const [accepting, setAccepting] = useState(false);

  // Make every remaining draft the interviewer's own, so "(draft)" goes.
  async function acceptAll() {
    setAccepting(true);
    setEvalMessage(null);
    try {
      const res = await fetch(`/api/interview-guides/${guide.id}/accept`, { method: "POST" });
      const out = (await res.json().catch(() => ({}))) as { message?: string; guide?: GuideView; ratings?: number; values?: number };
      if (!res.ok || !out.guide) throw new Error(out.message ?? "Could not accept the suggestions.");
      setGuide(out.guide);
      setEvalMessage(`Accepted ${out.ratings ?? 0} rating${out.ratings === 1 ? "" : "s"} and ${out.values ?? 0} value call${out.values === 1 ? "" : "s"}. They are yours now.`);
    } catch (caught) {
      setEvalMessage(caught instanceof Error ? caught.message : "Could not accept the suggestions.");
    } finally {
      setAccepting(false);
    }
  }

  async function evaluate() {
    setEvaluating(true);
    setEvalMessage(null);
    try {
      const res = await fetch(`/api/interview-guides/${guide.id}/evaluate`, { method: "POST" });
      const out = (await res.json().catch(() => ({}))) as { message?: string; judged?: number; lessonsUsed?: number; guide?: GuideView };
      if (!res.ok || !out.guide) throw new Error(out.message ?? "Could not evaluate the answers.");
      setGuide(out.guide);
      setEvalMessage(
        `Suggested a rating and values for ${out.judged} answer${out.judged === 1 ? "" : "s"}` +
          (out.lessonsUsed ? `, following ${out.lessonsUsed} of your past correction${out.lessonsUsed === 1 ? "" : "s"}.` : ".")
      );
    } catch (caught) {
      setEvalMessage(caught instanceof Error ? caught.message : "Could not evaluate the answers.");
    } finally {
      setEvaluating(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${guide.title}" and every answer typed into it? This cannot be undone.`)) return;
    const res = await fetch(`/api/interview-guides/${guide.id}`, { method: "DELETE" });
    if (res.ok) router.push("/interview-questions/guides");
  }

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5 lg:px-8">
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <Link href="/interview-questions/guides" className="inline-flex items-center gap-1 text-xs font-semibold text-white/70 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Saved guides
        </Link>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview guide</p>
        <h1 className="mt-0.5 break-words text-2xl font-semibold text-white">{guide.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
          {guide.candidate ? (
            <Link href={`/candidates/${guide.candidate.id}?tab=interviews`} className="font-semibold text-white underline-offset-2 hover:underline">
              {guide.candidate.displayName}
            </Link>
          ) : (
            <span>No candidate linked</span>
          )}
          {guide.interview ? (
            <Link href={`/interviews/${guide.interview.id}`} className="underline-offset-2 hover:underline">
              · {formatDateTimeWithZone(guide.interview.startDateTime, guide.interview.timezone)}
            </Link>
          ) : null}
          {guide.interviewer ? <span>· {guide.interviewer}</span> : null}
          <span>
            · {answered} of {guide.items.length} answered
          </span>
        </div>
      </section>

      <InterviewTabs active="saved" />

      {/* Link */}
      <section className={panelCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={`${headCls} flex items-center gap-1.5`}>
            <Link2 className="h-3.5 w-3.5" /> Candidate and interview
          </h2>
          {!linking ? (
            <button type="button" onClick={() => setLinking(true)} className="text-xs font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
              Change
            </button>
          ) : null}
        </div>
        {linking ? (
          <div className="mt-4">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
              <GuideLinkPicker candidate={pickCandidate} interviewId={pickInterview} onCandidate={setPickCandidate} onInterview={setPickInterview} />
            </div>
            <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">{LINK_HINT}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-brand-lea/10 pt-4 dark:border-white/10">
              <Button onClick={saveLink} disabled={linkBusy || (!pickCandidate && !guide.candidate)}>
                {linkBusy ? "Saving…" : "Save link"}
              </Button>
              {guide.interview ? (
                <button type="button" onClick={() => setLinking(false)} className="text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
                  Cancel
                </button>
              ) : null}
              {linkError ? <span className="text-xs font-medium text-red-700 dark:text-red-300">{linkError}</span> : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-brand-lea dark:text-slate-100">
            On {guide.candidate?.displayName}&apos;s interview of {guide.interview ? formatDateTimeWithZone(guide.interview.startDateTime, guide.interview.timezone) : ""}. It shows there, under Interview guides.
          </p>
        )}
      </section>

      {/* Questions */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={headCls}>Questions · {guide.items.length}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setShowGuidance((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
              {showGuidance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showGuidance ? "Hide" : "Show"} strong answer &amp; listen for
            </button>
            <Button variant="secondary" size="sm" onClick={() => setTranscriptOpen(true)}>
              <FileText className="h-4 w-4" /> Fill from transcript
            </Button>
          </div>
        </div>
        <TranscriptFillModal open={transcriptOpen} onClose={() => setTranscriptOpen(false)} guideId={guide.id} items={guide.items} onSaved={onItemSaved} />
        <ol className="space-y-3">
          {guide.items.map((item, i) => (
            <QuestionCard key={item.id} guideId={guide.id} item={item} index={i} showGuidance={showGuidance} onSaved={onItemSaved} />
          ))}
        </ol>
      </section>

      {/* Draft evaluation */}
      <section className={panelCls}>
        <h2 className={`${headCls} flex items-center gap-1.5`}>
          <Sparkles className="h-3.5 w-3.5" /> Evaluate the answers (draft)
        </h2>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          Reads each question and answer and suggests two things: a rating (Strong, Adequate, Weak or Did not answer) and
          which core values the answer actually showed, unticking a value the question was written for if the answer did
          not show it and adding any other it did, each with a one-line reason. Anything you set yourself is never changed.
          It judges the answer notes, not the interview itself, so short notes can read as weak answers.
        </p>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          <b className="font-semibold text-brand-lea dark:text-slate-100">It learns from you:</b> when you change a rating or
          a value it suggested, that correction is saved, and on later runs it is shown your most recent corrections as
          examples to follow. It is not retrained; remove a correction below and it is forgotten.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={evaluate} disabled={evaluating || answered === 0}>
            <Sparkles className="h-4 w-4" /> {evaluating ? "Evaluating…" : "Evaluate answers"}
          </Button>
          {draftRatings + draftValues > 0 ? (
            <Button variant="secondary" onClick={acceptAll} disabled={accepting || evaluating}>
              <Check className="h-4 w-4" /> {accepting ? "Accepting…" : "Accept all draft suggestions"}
            </Button>
          ) : null}
          {evalMessage ? <span className="text-xs text-brand-grey dark:text-slate-400">{evalMessage}</span> : null}
        </div>
        {draftRatings + draftValues > 0 ? (
          <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">
            {draftRatings} rating{draftRatings === 1 ? "" : "s"} and {draftValues} value call{draftValues === 1 ? "" : "s"} are still drafts. Accepting
            makes them yours; the evaluator leaves them alone after, and the &ldquo;(draft)&rdquo; label goes.
          </p>
        ) : null}
        <LearnedPanel refreshKey={`${learnTick}-${evalMessage ?? ""}`} />
      </section>

      {/* Core values */}
      <section className={panelCls}>
        <h2 className={`${headCls} flex items-center gap-1.5`}>
          <Star className="h-3.5 w-3.5 text-brand-gold" /> Rate the four core values
        </h2>
        <p className="mt-1 mb-3 text-xs text-brand-grey dark:text-slate-400">
          This is the interview&apos;s scorecard — the same one on the candidate&apos;s interview, and the one the hiring manager
          sees. Each person who interviews adds their own.
        </p>
        <CoreValueChart items={guide.items} />
        {guide.interview ? (
          <CoreValuesPanel interviewId={guide.interview.id} />
        ) : (
          <p className="text-sm text-brand-grey dark:text-slate-400">Link this guide to an interview above to rate the core values.</p>
        )}
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300">
          <Trash2 className="h-4 w-4" /> Delete this guide
        </button>
      </div>
    </div>
  );
}
