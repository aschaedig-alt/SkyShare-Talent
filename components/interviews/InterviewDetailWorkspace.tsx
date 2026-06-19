"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Pencil, Trash2, ClipboardCheck, Star } from "lucide-react";
import type { InterviewDetail, ScorecardView } from "@/lib/data/interview-detail";
import {
  RATINGS,
  RECOMMENDATIONS,
  RATING_LABEL,
  RECOMMENDATION_LABEL,
  type RatingKey,
  type RecommendationKey,
  type ScorecardItem
} from "@/lib/interviews/scorecard";
import { InterviewerPicker } from "@/components/calendar/InterviewerPicker";
import { formatDateTimeWithZone } from "@/lib/calendar/format";

const inputCls = "w-full rounded-lg border border-brand-lea/20 px-3 py-2 text-sm outline-none transition focus:border-brand-gold";

function recoTone(key: RecommendationKey): string {
  switch (key) {
    case "STRONG_YES":
      return "bg-emerald-100 text-emerald-800";
    case "YES":
      return "bg-teal-100 text-teal-800";
    case "NO":
      return "bg-amber-100 text-amber-800";
    case "STRONG_NO":
      return "bg-red-100 text-red-800";
  }
}

function avgText(avg: number | null) {
  return avg === null ? "—" : avg.toFixed(1);
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
  const [items, setItems] = useState<ScorecardItem[]>(() =>
    initial ? initial.items.map((i) => ({ ...i })) : detail.bankQuestions.map((q) => ({ q, rating: null as RatingKey | null }))
  );
  const [recommendation, setRecommendation] = useState<string>(initial?.recommendation ?? "");
  const [comments, setComments] = useState(initial?.comments ?? "");
  const [newQ, setNewQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setRating(idx: number, rating: RatingKey) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, rating: it.rating === rating ? null : rating } : it)));
  }
  function setText(idx: number, q: string) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, q } : it)));
  }
  function removeItem(idx: number) {
    setItems((cur) => cur.filter((_, i) => i !== idx));
  }
  function addItem() {
    const q = newQ.trim();
    if (!q) return;
    setItems((cur) => [...cur, { q, rating: null }]);
    setNewQ("");
  }

  async function save() {
    setBusy(true);
    setError(null);
    const cleanItems = items.filter((it) => it.q.trim()).map((it) => ({ q: it.q.trim(), rating: it.rating }));
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
    <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/5 p-4">
      <label className="grid gap-1 text-xs font-semibold text-brand-lea">
        Interviewer
        <InterviewerPicker
          interviewers={detail.interviewers}
          activeDepartmentKey={detail.departmentKey}
          defaultValue={interviewer}
          onValueChange={setInterviewer}
        />
      </label>

      <div className="mt-3">
        <span className="text-xs font-semibold text-brand-lea">Questions &amp; ratings</span>
        <div className="mt-1.5 space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-brand-lea/10 bg-white p-2.5">
              <div className="flex items-start gap-2">
                <input value={item.q} onChange={(e) => setText(idx, e.target.value)} className={`${inputCls} flex-1`} />
                <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className="mt-1 rounded p-1 text-brand-grey transition hover:text-red-600">
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
                      className={`rounded border px-2.5 py-0.5 text-[11px] font-semibold transition hover:shadow-glow ${
                        active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea"
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
        <div className="mt-2 flex gap-2">
          <input
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Add a question to rate"
            className={`${inputCls} flex-1`}
          />
          <button type="button" onClick={addItem} disabled={!newQ.trim()} className="inline-flex items-center gap-1 rounded-lg border border-brand-lea/20 px-2.5 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="mt-3">
        <span className="text-xs font-semibold text-brand-lea">Overall recommendation</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {RECOMMENDATIONS.map((r) => {
            const active = recommendation === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRecommendation(active ? "" : r.key)}
                className={`rounded border px-3 py-1 text-xs font-semibold transition hover:shadow-glow ${
                  active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-3 grid gap-1 text-xs font-semibold text-brand-lea">
        Comments
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} className={inputCls} />
      </label>

      <div className="mt-3 flex items-center justify-end gap-3">
        {error ? <span className="mr-auto text-xs font-medium text-red-700">{error}</span> : null}
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy || !interviewer.trim()} className="rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
          {busy ? "Saving…" : initial ? "Save scorecard" : "Add scorecard"}
        </button>
      </div>
    </div>
  );
}

export function InterviewDetailWorkspace({ detail }: { detail: InterviewDetail }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function afterSave() {
    setCreating(false);
    setEditingId(null);
    router.refresh();
  }

  async function remove(card: ScorecardView) {
    if (!window.confirm(`Delete ${card.interviewer}'s scorecard?`)) return;
    setBusyId(card.id);
    try {
      const res = await fetch(`/api/interview-scorecards/${card.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const agg = detail.aggregate;

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="overflow-hidden rounded-xl bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <Link href="/calendar" className="inline-flex items-center gap-1 text-xs font-semibold text-white/70 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Calendar
        </Link>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview</p>
        <h1 className="mt-0.5 text-3xl font-semibold text-white">{detail.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
          <Link href={`/candidates/${detail.candidate.id}`} className="font-semibold text-white underline-offset-2 hover:underline">
            {detail.candidate.displayName}
          </Link>
          {detail.job ? <span>· {detail.job.title}</span> : null}
          <span>· {formatDateTimeWithZone(detail.startDateTime, detail.timezone)}</span>
          <span>· {detail.status}</span>
        </div>
      </section>

      {/* Aggregate */}
      <section className="grid gap-3 sm:grid-cols-[auto,1fr]">
        <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-lea/5">
            <span className="text-2xl font-semibold leading-none text-brand-lea">{avgText(agg.average)}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-grey">of 4</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-brand-lea">
              <Star className="h-4 w-4 text-brand-gold" /> Combined score
            </div>
            <p className="text-xs text-brand-grey">
              Across {agg.count} scorecard{agg.count === 1 ? "" : "s"}. Each interviewer counts equally.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
          {RECOMMENDATIONS.map((r) => {
            const n = agg.recommendations[r.key] ?? 0;
            if (n === 0) return null;
            return (
              <span key={r.key} className={`rounded px-3 py-1 text-xs font-semibold ${recoTone(r.key)}`}>
                {r.label}: {n}
              </span>
            );
          })}
          {agg.count === 0 ? <span className="text-sm text-brand-grey">No scorecards yet.</span> : null}
        </div>
      </section>

      {/* Add */}
      {!creating ? (
        <button
          onClick={() => {
            setEditingId(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
        >
          <Plus className="h-4 w-4" /> Add scorecard
        </button>
      ) : (
        <ScorecardEditor detail={detail} onCancel={() => setCreating(false)} onSaved={afterSave} />
      )}

      {/* Scorecards */}
      <section className="space-y-3">
        {detail.scorecards.length === 0 && !creating ? (
          <div className="rounded-xl bg-white px-4 py-12 text-center shadow-panel ring-1 ring-brand-lea/10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70">
              <ClipboardCheck className="h-5 w-5 text-brand-grey" />
            </div>
            <p className="mt-3 text-base font-semibold text-brand-lea">No scorecards yet</p>
            <p className="mt-1 text-sm text-brand-grey">Add the first interviewer&apos;s scorecard above.</p>
          </div>
        ) : (
          detail.scorecards.map((card) =>
            editingId === card.id ? (
              <ScorecardEditor key={card.id} detail={detail} initial={card} onCancel={() => setEditingId(null)} onSaved={afterSave} />
            ) : (
              <div key={card.id} className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-brand-lea">{card.interviewer}</span>
                    {card.recommendation ? (
                      <span className={`rounded px-2.5 py-0.5 text-[11px] font-semibold ${recoTone(card.recommendation)}`}>
                        {RECOMMENDATION_LABEL[card.recommendation]}
                      </span>
                    ) : null}
                    <span className="rounded bg-brand-lea/5 px-2.5 py-0.5 text-[11px] font-semibold text-brand-lea">{avgText(card.average)} / 4</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setCreating(false); setEditingId(card.id); }} title="Edit" className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(card)} disabled={busyId === card.id} title="Delete" className="rounded p-1.5 text-brand-grey transition hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {card.items.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {card.items.map((it, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-brand-black">{it.q}</span>
                        <span className={`shrink-0 text-xs font-semibold ${it.rating ? "text-brand-lea" : "text-brand-grey/60"}`}>
                          {it.rating ? RATING_LABEL[it.rating] : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {card.comments ? <p className="mt-2 border-l-2 border-brand-sweet/40 pl-2 text-xs italic text-brand-grey">{card.comments}</p> : null}
              </div>
            )
          )
        )}
      </section>
    </div>
  );
}
