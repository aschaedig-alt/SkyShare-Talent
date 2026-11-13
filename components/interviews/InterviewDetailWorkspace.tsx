"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Pencil, Trash2, ClipboardCheck, Star, ChevronDown, ChevronRight } from "lucide-react";
import type { InterviewDetail, ScorecardView } from "@/lib/data/interview-detail";
import {
  RATINGS,
  parText,
  pointsText,
  ratingPointsLabel,
  RECOMMENDATIONS,
  RATING_LABEL,
  RECOMMENDATION_LABEL,
  type RatingKey,
  type RecommendationKey,
  type ScorecardItem,
  withCoreValues
} from "@/lib/interviews/scorecard";
import { VALUE_DESCRIPTIONS } from "@/lib/compliments/constants";
import { InterviewerPicker } from "@/components/calendar/InterviewerPicker";
import { Button } from "@/components/ui";
import { RichNoteField, StoredRichText } from "@/components/richtext/RichNoteField";
import { formatDateTimeWithZone } from "@/lib/calendar/format";
import { RichTextView } from "@/components/richtext/RichTextEditor";
import { interviewOutcomeLabel, interviewOutcomeTone } from "@/lib/interviews/constants";

function recoTone(key: RecommendationKey): string {
  switch (key) {
    case "STRONG_YES":
      return "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "YES":
      return "bg-teal-100 dark:bg-teal-500/15 text-teal-800 dark:text-teal-300";
    case "NO":
      return "bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "STRONG_NO":
      return "bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300";
  }
}

/** The number alone, for the big combined-score tile. */
function pointsNumber(p: { points: number } | null) {
  return p === null ? "—" : Number.isInteger(p.points) ? String(p.points) : p.points.toFixed(1);
}

function ScorecardEditor({
  detail,
  initial,
  onCancel,
  onSaved
}: {
  detail: InterviewDetail;
  initial?: ScorecardView;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [interviewer, setInterviewer] = useState(initial?.interviewer ?? "");
  // The four core values always lead, on new scorecards and on older ones when
  // they are edited, so every scorecard rates them (Quality of Hire, Nov 10 2026).
  //
  // A scorecard rates the core values only. It used to pre-fill every active
  // Question Bank question as a rating line too (19 for crew), which is not what
  // the bank is for - it holds questions to ASK - and on a phone it buried the
  // four values under a wall of questions. His call, Nov 13 2026: remove them
  // entirely. Questions an older scorecard actually RATED are kept and shown
  // (282 imported scorecards are rated on questions alone); unrated ones are
  // dropped, since they carry no score.
  const [items, setItems] = useState<ScorecardItem[]>(() =>
    withCoreValues(initial ? initial.items.filter((i) => i.value || i.rating).map((i) => ({ ...i })) : [])
  );
  const [recommendation, setRecommendation] = useState<string>(initial?.recommendation ?? "");
  const [comments, setComments] = useState(initial?.comments ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setRating(idx: number, rating: RatingKey) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, rating: it.rating === rating ? null : rating } : it)));
  }
  function removeItem(idx: number) {
    setItems((cur) => cur.filter((_, i) => i !== idx));
  }
  const hasQuestions = items.some((it) => !it.value);

  async function save() {
    setBusy(true);
    setError(null);
    const cleanItems = items
      .filter((it) => it.value || it.q.trim())
      .map((it) => ({ q: it.q.trim(), rating: it.rating, ...(it.value ? { value: it.value } : {}) }));
    const payload = initial
      ? { interviewer, recommendation: recommendation || null, items: cleanItems, comments: comments || null }
      : { interviewId: detail.id, interviewer, recommendation: recommendation || null, items: cleanItems, comments: comments || null };
    try {
      const res = await fetch(initial ? `/api/interview-scorecards/${initial.id}` : "/api/interview-scorecards", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Could not save scorecard.");
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save scorecard.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-brand-gold/30 bg-brand-gold/5 p-4">
      <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
        Interviewer
        <InterviewerPicker
          interviewers={detail.interviewers}
          activeDepartmentKey={detail.departmentKey}
          defaultValue={interviewer}
          onValueChange={setInterviewer}
        />
      </label>

      <div className="mt-3">
        <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">Core values</span>
        <p className="text-[11px] text-brand-grey dark:text-slate-400">Rated on every scorecard, and again at the 90-day check-in, so we can see how well interviews predict.</p>
        <div className="mt-1.5 space-y-2">
          {items.map((item, idx) =>
            item.value ? (
              <div key={idx} className="rounded border border-brand-gold/30 bg-white p-2.5 dark:border-brand-gold/20 dark:bg-brand-panel">
                <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{item.value}</div>
                {VALUE_DESCRIPTIONS[item.value] ? (
                  <p className="text-[11px] text-brand-grey dark:text-slate-400">{VALUE_DESCRIPTIONS[item.value]}</p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {RATINGS.map((r) => {
                    const active = item.rating === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setRating(idx, r.key)}
                        title={ratingPointsLabel(r.key)}
                        className={`rounded border px-2.5 py-0.5 text-[11px] font-semibold transition hover:shadow-glow ${
                          active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null
          )}
        </div>
      </div>

      {hasQuestions ? (
      <div className="mt-3">
        <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">Questions rated on this scorecard earlier</span>
        <div className="mt-1.5 space-y-2">
          {items.map((item, idx) => item.value ? null : (
            <div key={idx} className="rounded border border-brand-lea/10 bg-white p-2.5 dark:border-white/10 dark:bg-brand-panel">
              <div className="flex items-start gap-2">
                <span className="flex-1 text-sm text-brand-lea dark:text-slate-100">{item.q}</span>
                <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className="mt-1 rounded p-1 text-brand-grey transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {RATINGS.map((r) => {
                  const active = item.rating === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRating(idx, r.key)}
                        title={ratingPointsLabel(r.key)}
                      className={`rounded border px-2.5 py-0.5 text-[11px] font-semibold transition hover:shadow-glow ${
                        active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      ) : null}

      <div className="mt-3">
        <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">Overall recommendation</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {RECOMMENDATIONS.map((r) => {
            const active = recommendation === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRecommendation(active ? "" : r.key)}
                className={`rounded border px-3 py-1 text-xs font-semibold transition hover:shadow-glow ${
                  active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <RichNoteField
        className="mt-3"
        label="Comments"
        labelClassName="text-xs font-semibold text-brand-lea dark:text-slate-100"
        value={comments}
        onChange={setComments}
        minHeight={60}
      />

      <div className="mt-3 flex items-center justify-end gap-3">
        {error ? <span className="mr-auto text-xs font-medium text-red-700 dark:text-red-300">{error}</span> : null}
        <button type="button" onClick={onCancel} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
          Cancel
        </button>
        <Button onClick={save} disabled={busy || !interviewer.trim()}>
          {busy ? "Saving…" : initial ? "Save scorecard" : "Add scorecard"}
        </Button>
      </div>
    </div>
  );
}

/**
 * A section that starts OPEN and can be folded away. Aimee asked for the
 * interview view to "auto expand with the ability to collapse" (feedback
 * cmwco78eg), so nothing here is hidden until somebody chooses to hide it.
 */
export function CollapsibleSection({
  title,
  badge,
  children
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded py-1 text-left transition hover:text-brand-lea"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
        )}
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-sweet">{title}</span>
        {badge}
        <span className="ml-auto text-[11px] font-semibold text-brand-grey dark:text-slate-400">{open ? "Collapse" : "Expand"}</span>
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </section>
  );
}

/** The write-up: who sat in, next step and the pasted notes. Read-only here; it is edited on the candidate's Interviews tab. */
export function InterviewWriteUpBody({ detail }: { detail: InterviewDetail }) {
  const hasNotes = Boolean(detail.notesHtml || detail.notes?.trim());
  return (
    <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-grey dark:text-slate-400">
        {detail.interviewer ? (
          <span>
            <span className="font-semibold text-brand-lea dark:text-slate-100">{detail.interviewer}</span>
            {detail.coInterviewers.length > 0 ? ` + ${detail.coInterviewers.join(", ")}` : ""}
          </span>
        ) : null}
        {detail.nextStep ? (
          <span className="rounded bg-brand-gold/15 px-2 py-0.5 font-medium text-brand-lea dark:text-slate-200">Next: {detail.nextStep}</span>
        ) : null}
      </div>
      {detail.notesHtml ? (
        <RichTextView html={detail.notesHtml} className="mt-2" />
      ) : detail.notes?.trim() ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-brand-lea dark:text-slate-200">{detail.notes.trim()}</p>
      ) : null}
      {!hasNotes ? (
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          No write-up yet. Add one from{" "}
          <Link
            href={`/candidates/${detail.candidate.id}?tab=interviews`}
            className="font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100"
          >
            {detail.candidate.displayName}&apos;s Interviews tab
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

/**
 * The combined score, the add button and every scorecard. Shared by the full
 * page and the drawer; the caller decides how to reload after a change (the
 * page refreshes the route, the drawer refetches its own copy).
 */
export function InterviewScorecards({
  detail,
  onChanged,
  onEditingChange
}: {
  detail: InterviewDetail;
  onChanged: () => void;
  /** True while a scorecard is being written, so a drawer can warn before closing. */
  onEditingChange?: (editing: boolean) => void;
}) {
  const [creating, setCreatingState] = useState(false);
  const [editingId, setEditingIdState] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function setCreating(v: boolean) {
    setCreatingState(v);
    onEditingChange?.(v || editingId !== null);
  }
  function setEditingId(v: string | null) {
    setEditingIdState(v);
    onEditingChange?.(v !== null || creating);
  }

  function afterSave() {
    setCreatingState(false);
    setEditingIdState(null);
    onEditingChange?.(false);
    onChanged();
  }

  async function remove(card: ScorecardView) {
    if (!window.confirm(`Delete ${card.interviewer}'s scorecard?`)) return;
    setBusyId(card.id);
    try {
      const res = await fetch(`/api/interview-scorecards/${card.id}`, { method: "DELETE" });
      if (res.ok) onChanged();
    } finally {
      setBusyId(null);
    }
  }

  const agg = detail.aggregate;

  return (
    <div className="space-y-3">
      {/* Aggregate */}
      <div className="grid gap-3 sm:grid-cols-[1fr,auto]">
        <div className="flex items-center gap-4 rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded bg-brand-lea/5">
            <span className="text-2xl font-semibold leading-none text-brand-lea dark:text-slate-100">{pointsNumber(agg.score)}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">points</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-brand-lea dark:text-slate-100">
              <Star className="h-4 w-4 text-brand-gold" /> Combined score
            </div>
            <p className="text-xs text-brand-grey dark:text-slate-400">
              {agg.score ? `${parText(agg.score)}. ` : ""}Across {agg.count} scorecard{agg.count === 1 ? "" : "s"}, each interviewer counting equally. Exceeds 1.5, Meets 1, Can Develop 0.5, Does Not Meet 0.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          {RECOMMENDATIONS.map((r) => {
            const n = agg.recommendations[r.key] ?? 0;
            if (n === 0) return null;
            return (
              <span key={r.key} className={`whitespace-nowrap rounded px-3 py-1 text-xs font-semibold ${recoTone(r.key)}`}>
                {r.label}: {n}
              </span>
            );
          })}
          {agg.count === 0 ? <span className="text-sm text-brand-grey dark:text-slate-400">No scorecards yet.</span> : null}
        </div>
      </div>

      {/* Add */}
      {!creating ? (
        <Button
          onClick={() => {
            setEditingId(null);
            setCreating(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add scorecard
        </Button>
      ) : (
        <ScorecardEditor detail={detail} onCancel={() => setCreating(false)} onSaved={afterSave} />
      )}

      {/* Scorecards */}
      {detail.scorecards.length === 0 && !creating ? (
        <div className="rounded bg-white px-4 py-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70 dark:bg-white/5">
            <ClipboardCheck className="h-5 w-5 text-brand-grey dark:text-slate-400" />
          </div>
          <p className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">No scorecards yet</p>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Add the first interviewer&apos;s scorecard above.</p>
        </div>
      ) : (
        detail.scorecards.map((card) =>
          editingId === card.id ? (
            <ScorecardEditor key={card.id} detail={detail} initial={card} onCancel={() => setEditingId(null)} onSaved={afterSave} />
          ) : (
            <div key={card.id} className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-brand-lea dark:text-slate-100">{card.interviewer}</span>
                  {card.recommendation ? (
                    <span className={`rounded px-2.5 py-0.5 text-[11px] font-semibold ${recoTone(card.recommendation)}`}>
                      {RECOMMENDATION_LABEL[card.recommendation]}
                    </span>
                  ) : null}
                  <span className="rounded bg-brand-lea/5 px-2.5 py-0.5 text-[11px] font-semibold text-brand-lea dark:text-slate-100">{pointsText(card.score)}{card.score ? ` · ${parText(card.score)}` : ""}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setCreating(false); setEditingId(card.id); }} title="Edit" className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:bg-white/5">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(card)} disabled={busyId === card.id} title="Delete" className="rounded p-1.5 text-brand-grey transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* Unrated lines are left out: a scorecard saved before Nov 13 could
                  carry all 19 bank questions with no rating, which read as clutter. */}
              {card.items.some((it) => it.value || it.rating) ? (
                <ul className="mt-2 space-y-1">
                  {card.items.filter((it) => it.value || it.rating).map((it, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-brand-black dark:text-slate-100">
                        {it.value ? <span className="mr-1.5 rounded border border-brand-gold/40 px-1.5 py-0.5 text-[10px] font-semibold text-brand-lea dark:text-slate-200">Core value</span> : null}
                        {it.value ?? it.q}
                      </span>
                      <span className={`shrink-0 text-xs font-semibold ${it.rating ? "text-brand-lea dark:text-slate-100" : "text-brand-grey/60 dark:text-slate-500"}`}>
                        {it.rating ? RATING_LABEL[it.rating] : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {card.comments ? (
                <div className="mt-2 border-l-2 border-brand-sweet/40 pl-2">
                  <StoredRichText value={card.comments} className="!text-xs !text-brand-grey dark:!text-slate-400" />
                </div>
              ) : null}
            </div>
          )
        )
      )}
    </div>
  );
}

/** The outcome chip shown beside the Write-up heading. */
export function OutcomeChip({ outcome }: { outcome: string | null }) {
  const label = interviewOutcomeLabel(outcome);
  if (!label) return null;
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${interviewOutcomeTone(outcome)}`}>{label}</span>;
}

/** Write-up and scorecards, both open, each collapsible. The drawer and the full page both render this. */
export function InterviewBody({
  detail,
  onChanged,
  onEditingChange
}: {
  detail: InterviewDetail;
  onChanged: () => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <CollapsibleSection title="Write-up" badge={<OutcomeChip outcome={detail.outcome} />}>
        <InterviewWriteUpBody detail={detail} />
      </CollapsibleSection>
      <CollapsibleSection
        title={`Scorecards (${detail.scorecards.length})`}
        badge={
          detail.aggregate.score ? (
            <span className="rounded bg-brand-lea/5 px-2 py-0.5 text-[11px] font-semibold text-brand-lea dark:text-slate-100">{pointsText(detail.aggregate.score)}</span>
          ) : null
        }
      >
        <InterviewScorecards detail={detail} onChanged={onChanged} onEditingChange={onEditingChange} />
      </CollapsibleSection>
    </div>
  );
}

/**
 * The full page, /interviews/<id>. Most people now see an interview in the
 * drawer (InterviewDrawer) over the list they clicked from; this page is what a
 * ctrl-click, a pasted link or "Open full page" lands on.
 */
export function InterviewDetailWorkspace({ detail }: { detail: InterviewDetail }) {
  const router = useRouter();

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        {/* Back to where the interview lives. This used to say "Calendar" even
            when you had come from the candidate's profile. */}
        <Link
          href={`/candidates/${detail.candidate.id}?tab=interviews`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-white/70 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {detail.candidate.displayName}&apos;s interviews
        </Link>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-white">{detail.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
          <Link href={`/candidates/${detail.candidate.id}`} className="font-semibold text-white underline-offset-2 hover:underline">
            {detail.candidate.displayName}
          </Link>
          {detail.job ? <span>· {detail.job.title}</span> : null}
          <span>· {formatDateTimeWithZone(detail.startDateTime, detail.timezone)}</span>
          <span>· {detail.status}</span>
        </div>
      </section>

      <InterviewBody detail={detail} onChanged={() => router.refresh()} />
    </div>
  );
}
