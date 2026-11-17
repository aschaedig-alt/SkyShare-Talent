"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import type { InterviewDetail } from "@/lib/data/interview-detail";
import { RichTextView } from "@/components/richtext/RichTextEditor";
import { StoredRichText } from "@/components/richtext/RichNoteField";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { questionHtml } from "@/lib/interview-questions/rich";
import { STRENGTH_LABEL } from "@/lib/interview-guides/constants";
import { CORE_VALUE_NAMES, RATING_LABEL, RECOMMENDATION_LABEL, parText, pointsText, type RatingKey } from "@/lib/interviews/scorecard";
import { formatDateLong } from "@/lib/calendar/format";

// An interview laid out for paper: his layout A (Nov 17 2026). Checkboxes pick
// what goes in (All / Scorecard / Interview notes / Interview guide, all on by
// default), and the type is set small (10.5px body) so more fits on each page.
//   Page 1  the header, the scorecard (recommendation, points, the four core
//           values) and the interview write-up from the log.
//   Page 2+ the interview guide's questions and answers. "Not asked"
//           questions are left out entirely, so they take no space.
//
// Printing goes through the browser's print dialog, which does both jobs: pick
// "Save as PDF" or a printer. The document title is set to a file name, which
// Chrome uses for the saved PDF.
//
// The sheet is always light (it is paper), whatever the app's theme; the
// toolbar above it is screen-only.
//
// Deliberately NO <section> and no .shadow-panel in here: app/globals.css sets
// break-inside: avoid on both for print, which pushed this whole sheet (taller
// than a page) onto page 2 and left page 1 blank. Only each question-and-answer
// is kept together.

const INK = "text-[#1c2b3a]";
const MUTED = "text-[#5b6b7b]";
const VALUE_NAME: Record<string, string> = Object.fromEntries(COMPANY_VALUES.map((v) => [v.colorKey, v.name]));

function fileTitle(d: InterviewDetail): string {
  const date = new Date(d.startDateTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${d.candidate.displayName} - ${d.title} - ${date}`;
}

const RECO_TONE: Record<string, string> = {
  STRONG_YES: "bg-[#d1fae5] text-[#065f46]",
  YES: "bg-[#ccfbf1] text-[#115e59]",
  NO: "bg-[#fef3c7] text-[#92400e]",
  STRONG_NO: "bg-[#fee2e2] text-[#991b1b]"
};

export function InterviewPrintSheet({ detail }: { detail: InterviewDetail }) {
  useEffect(() => {
    const before = document.title;
    document.title = fileTitle(detail);
    return () => {
      document.title = before;
    };
  }, [detail]);

  // One rating per value per scorecard; usually there is one scorecard.
  const valueRows = CORE_VALUE_NAMES.map((name) => ({
    name,
    ratings: detail.scorecards
      .map((c) => ({ who: c.interviewer, rating: c.items.find((i) => i.value === name)?.rating ?? null }))
      .filter((r): r is { who: string; rating: RatingKey } => Boolean(r.rating))
  }));
  const several = detail.scorecards.length > 1;
  // What to print or save (his ask, Nov 17 2026): any mix, everything by default.
  const [show, setShow] = useState({ scorecard: true, notes: true, guide: true });
  const allOn = show.scorecard && show.notes && show.guide;
  const noneOn = !show.scorecard && !show.notes && !show.guide;
  const PARTS: Array<{ key: keyof typeof show; label: string }> = [
    { key: "scorecard", label: "Scorecard" },
    { key: "notes", label: "Interview notes" },
    { key: "guide", label: "Interview guide" }
  ];
  const hasNotes = Boolean(detail.notesHtml || detail.notes?.trim());
  const guides = detail.guides
    .map((g) => ({ ...g, asked: g.items.filter((it) => !it.skipped) }))
    .filter((g) => g.asked.length > 0);

  // ---- Page 1 always holds the header, scorecard and notes (Nov 17 2026: "make
  // the notes always appear on the 1st page only"). The same block is rendered
  // off-screen at the printed size (Letter, 7.5in wide inside the margins,
  // 10.05in tall) and the notes' text is stepped down from 10.5px until it fits,
  // never below MIN_NOTES_PX; the questions then start on page 2. If even the
  // smallest size does not fit, the notes run on and the toolbar says so.
  const page1 = (notesPx: number) => (
    <>
          {/* ---------- Page 1: header ---------- */}
          <header className="rounded bg-[#0d2c43] px-4 py-2.5 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#eaaa00]">SkyShare · Interview summary</p>
            <h1 className="text-xl font-semibold leading-tight">{detail.candidate.displayName}</h1>
            <p className="text-[11px] text-white/80">
              {detail.title}
              {detail.job ? ` · ${detail.job.title}` : ""}
              {` · ${formatDateLong(detail.startDateTime, detail.timezone)}`}
              {detail.interviewer ? ` · ${detail.interviewer}` : ""}
              {detail.coInterviewers.length ? ` + ${detail.coInterviewers.join(", ")}` : ""}
            </p>
          </header>
  
          {/* ---------- Page 1: scorecard ---------- */}
          {show.scorecard && detail.scorecards.length ? (
            <div className="mt-3 break-inside-avoid">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#466481]">Scorecard</h2>
                {detail.scorecards.map((c) =>
                  c.recommendation ? (
                    <span key={c.id} className={`rounded px-2 py-0.5 text-xs font-semibold ${RECO_TONE[c.recommendation]}`}>
                      {RECOMMENDATION_LABEL[c.recommendation]}
                      {several ? ` · ${c.interviewer}` : ""}
                    </span>
                  ) : null
                )}
                {detail.aggregate.score ? (
                  <span className="text-xs">
                    <b className="font-semibold">{pointsText(detail.aggregate.score)}</b> <span className={MUTED}>({parText(detail.aggregate.score)})</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {valueRows.map((v) => (
                  <div key={v.name} className="rounded border border-[#d7dde4] border-t-2 border-t-[#eaaa00] px-2 py-1 text-center">
                    <div className={`text-[10px] ${MUTED}`}>{v.name}</div>
                    {v.ratings.length ? (
                      v.ratings.map((r) => (
                        <div key={r.who} className="text-[12px] font-semibold">
                          {RATING_LABEL[r.rating]}
                          {several ? <span className={`block text-[9px] font-normal ${MUTED}`}>{r.who}</span> : null}
                        </div>
                      ))
                    ) : (
                      <div className={`text-[12px] ${MUTED}`}>Not rated</div>
                    )}
                  </div>
                ))}
              </div>
              {detail.scorecards.some((c) => c.comments) ? (
                <div className="mt-2 space-y-1">
                  {detail.scorecards
                    .filter((c) => c.comments)
                    .map((c) => (
                      <div key={c.id} className="border-l-2 border-[#a6c9e7] pl-2 text-xs">
                        {several ? <b className="font-semibold">{c.interviewer}: </b> : null}
                        <StoredRichText value={c.comments} className={`!text-xs ${INK} [&_*]:!text-inherit`} />
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}
  
          {/* ---------- Page 1: the write-up from the log ---------- */}
          {show.notes && hasNotes ? (
            <div className="mt-3" style={{ fontSize: `${notesPx}px`, lineHeight: 1.32 }}>
              <h2 className="border-b border-[#d7dde4] pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#466481]">Interview notes</h2>
              {detail.notesHtml ? (
                <RichTextView
                  html={detail.notesHtml}
                  className={`mt-1.5 ![font-size:inherit] ![line-height:inherit] ${INK} [&_*]:!text-inherit [&_li]:break-inside-avoid [&_strong]:!text-[#0d2c43] [&_p]:!my-0.5 [&_ul]:!my-0.5 [&_li]:!my-0`}
                />
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap">{detail.notes?.trim()}</p>
              )}
            </div>
          ) : null}
    </>
  );
  const START_PX = 10.5;
  const MIN_NOTES_PX = 8;
  // Page height minus the @page margins, less ~4 lines of slack: Chrome's print
  // layout came out about two lines taller than the same block measured on
  // screen (Chase Anderson, Nov 17 2026: 942px measured, overflowed on paper).
  const PAGE1_HEIGHT_PX = (11 - 0.45 - 0.5) * 96 - 56;
  const measureRef = useRef<HTMLDivElement>(null);
  const [trialPx, setTrialPx] = useState(START_PX);
  const [notesPx, setNotesPx] = useState(START_PX);
  const [overflows, setOverflows] = useState(false);
  // Start again from full size whenever what is included changes.
  useEffect(() => {
    setTrialPx(START_PX);
  }, [show.scorecard, show.notes, detail.id]);
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const fits = el.offsetHeight <= PAGE1_HEIGHT_PX;
    if (fits || trialPx <= MIN_NOTES_PX) {
      setNotesPx(trialPx);
      setOverflows(!fits);
    } else {
      setTrialPx((px) => Math.max(MIN_NOTES_PX, Math.round((px - 0.25) * 100) / 100));
    }
  }, [trialPx, PAGE1_HEIGHT_PX]);
  const page1HasContent = (show.scorecard && detail.scorecards.length > 0) || (show.notes && hasNotes);

  return (
    <div className="mx-auto max-w-[8.5in] px-4 py-6 print:max-w-none print:p-0">
      {/* Off-screen measurer: page 1 at the printed width, at the size being tried. */}
      <div aria-hidden className="pointer-events-none invisible absolute left-[-10000px] top-0 print:hidden">
        <div ref={measureRef} className={`w-[7.5in] bg-white ${INK}`}>
          {page1(trialPx)}
        </div>
      </div>
      {/* Paper: Letter, 0.6in margins, page numbers bottom right (Chrome draws
          the margin boxes; untick "Headers and footers" for a clean page). */}
      <style>{`
        @page { size: letter; margin: 0.45in 0.5in 0.5in; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9px system-ui, sans-serif; color: #8a97a5; } @bottom-left { content: "${detail.candidate.displayName.replace(/"/g, "")} · Interview summary"; font: 9px system-ui, sans-serif; color: #8a97a5; } }
        @media print { .print-sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; } }
      `}</style>

      {/* Screen-only toolbar. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/candidates/${detail.candidate.id}?tab=interviews`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {detail.candidate.displayName}&apos;s interviews
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-brand-grey dark:text-slate-400">In the dialog, choose Save as PDF or a printer.</span>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={noneOn}
            className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:shadow-glow disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print or save as PDF
          </button>
        </div>
      </div>

      {/* What to include. The sheet below shows exactly what will print. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded bg-white px-4 py-3 text-sm shadow-[0_1px_4px_rgba(13,44,67,0.12)] ring-1 ring-brand-lea/10 print:hidden dark:bg-brand-panel dark:ring-white/10">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-sweet">Include</span>
        <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-brand-lea dark:text-slate-100">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() => setShow(allOn ? { scorecard: false, notes: false, guide: false } : { scorecard: true, notes: true, guide: true })}
            className="h-4 w-4 accent-[#0d2c43]"
          />
          All
        </label>
        {PARTS.map((part) => (
          <label key={part.key} className="inline-flex cursor-pointer items-center gap-2 text-brand-lea dark:text-slate-100">
            <input
              type="checkbox"
              checked={show[part.key]}
              onChange={() => setShow((cur) => ({ ...cur, [part.key]: !cur[part.key] }))}
              className="h-4 w-4 accent-[#0d2c43]"
            />
            {part.label}
          </label>
        ))}
        {noneOn ? <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Pick at least one.</span> : null}
        {show.notes && hasNotes && overflows ? (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            The notes are too long for page 1 even at the smallest size, so they run onto page 2.
          </span>
        ) : show.notes && hasNotes && notesPx < START_PX ? (
          <span className="text-xs text-brand-grey dark:text-slate-400">Notes set at {notesPx}px to fit on page 1.</span>
        ) : null}
      </div>

      <article className={`print-sheet rounded bg-white px-[0.5in] py-[0.45in] shadow-[0_1px_4px_rgba(13,44,67,0.12)] ring-1 ring-brand-lea/10 ${INK}`}>
        {page1(notesPx)}

        {/* ---------- Questions and answers (asked only), from page 2 ----------
            Page 1 is fitted above, so the questions always start a new page
            when anything comes before them. The heading is kept with the first
            question, and each question with its answer. */}
        {(show.guide ? guides : []).map((g, gi) => (
          <div key={g.id} className={gi === 0 && page1HasContent ? "mt-4 print:mt-0 print:break-before-page" : "mt-4"}>
            {gi === 0 && page1HasContent ? (
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a97a5] print:hidden">
                <span className="h-px flex-1 border-t border-dashed border-[#c5ced8]" /> Page 2 starts here{" "}
                <span className="h-px flex-1 border-t border-dashed border-[#c5ced8]" />
              </div>
            ) : null}
            <h2 className="break-after-avoid border-b border-[#d7dde4] pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#466481]">
              Interview questions and answers · {g.title}
            </h2>
            <ol className="mt-2 space-y-2.5">
              {g.asked.map((it, i) => (
                <li key={it.id} className="break-inside-avoid">
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 text-[11px] font-semibold ${MUTED}`}>{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <RichTextView html={questionHtml(it.text)} className={`min-w-0 flex-1 !text-[11px] font-semibold !leading-snug ${INK} [&_*]:!text-inherit [&_p:first-child]:mt-0 [&_p]:!my-0`} />
                        {it.strength ? (
                          <span className="shrink-0 rounded bg-[#e7f5ef] px-1.5 py-0.5 text-[9px] font-semibold text-[#0f5e45]">{STRENGTH_LABEL[it.strength]}</span>
                        ) : null}
                      </div>
                      {it.values.length ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {it.values.map((k) => (
                            <span key={k} className="rounded border border-[#eaaa00]/70 bg-[#fdf6e3] px-1 py-0 text-[8.5px] font-semibold text-[#0d2c43]">
                              ✓ {VALUE_NAME[k] ?? k}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {it.answer ? (
                        <div className="mt-1 border-l-2 border-[#a6c9e7] pl-2">
                          <StoredRichText value={it.answer} className={`!text-[10.5px] !leading-snug text-[#3b4b5b] [&_*]:!text-inherit [&_p]:!my-0.5`} />
                        </div>
                      ) : (
                        <p className={`mt-1 text-[11px] italic ${MUTED}`}>No answer recorded.</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}

        <p className={`mt-8 text-[9px] ${MUTED} print:hidden`}>Generated from SkyShare Journey. Questions marked Not asked are left out.</p>
      </article>
    </div>
  );
}
