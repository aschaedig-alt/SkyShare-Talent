"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { FileSignature, ArrowRight } from "lucide-react";
import { offerStatusLabel } from "@/lib/offers/constants";
import type { OffersBoard, OfferRow } from "@/lib/data/offers";
import { formatMomentDate, formatCalendarDay } from "@/lib/dates/display";

// sent/signed/declined are real moments (office timezone); the start date is a
// chosen calendar day (UTC). See lib/dates/display.ts for why they differ.
const fmtMoment = (iso: string | null) => formatMomentDate(iso) || null;
const fmtDay = (iso: string | null) => formatCalendarDay(iso) || null;

const CHIP: Record<string, string> = {
  PLANNED: "bg-brand-sweet/25 text-brand-lea dark:text-slate-100",
  STARTED: "bg-brand-eden/20 text-brand-eden dark:bg-brand-sweet/20 dark:text-slate-100",
  SENT: "bg-brand-gold/25 text-brand-lea dark:text-slate-100",
  SIGNED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  DECLINED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  // Not red: this ending was ours, not theirs. See lib/offers/constants.ts.
  NOT_SENT: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"
};

type Filter = "ALL" | "PLANNED" | "STARTED" | "SENT" | "SIGNED" | "DECLINED" | "NOT_SENT";

function OfferCard({ row }: { row: OfferRow }) {
  // A signed offer with nobody onboarding them is the thing that falls through
  // the cracks, so it gets called out rather than blending into the list.
  const needsOnboarding = row.status === "SIGNED" && !row.hireId;
  const dates = [
    row.sentAt ? `sent ${fmtMoment(row.sentAt)}` : null,
    row.signedAt ? `signed ${fmtMoment(row.signedAt)}` : null,
    row.declinedAt ? `declined ${fmtMoment(row.declinedAt)}` : null,
    row.notSentAt ? `stopped ${fmtMoment(row.notSentAt)}` : null,
    row.startDate ? `starts ${fmtDay(row.startDate)}` : null
  ].filter(Boolean);

  return (
    <div
      className={clsx(
        "rounded border p-3",
        needsOnboarding
          ? "border-brand-gold/40 bg-brand-sweet/12 dark:bg-brand-gold/10"
          : "border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/candidates/${row.candidateId}`}
            className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100"
          >
            {row.candidateName}
          </Link>
          <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
            {row.jobTitle ? (
              row.jobId ? (
                <Link href={`/recruiting-jobs?id=${row.jobId}`} className="hover:text-brand-eden">
                  {row.jobTitle}
                </Link>
              ) : (
                row.jobTitle
              )
            ) : (
              <span className="italic">No job linked</span>
            )}
            {row.candidateEmail ? ` · ${row.candidateEmail}` : ""}
          </div>
          {dates.length > 0 && (
            <div className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">{dates.join(" · ")}</div>
          )}
          {row.declineReason && row.status === "DECLINED" ? (
            <div className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">Reason: {row.declineReason}</div>
          ) : null}
          {/* Spelled out rather than left to the chip: on a board of offers, a
              closed one gets read as a rejection unless it says otherwise. */}
          {row.status === "NOT_SENT" ? (
            <div className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">
              Never sent — not declined{row.notSentReason ? `. ${row.notSentReason}` : ""}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.source && row.source !== "MANUAL" ? (
            <span className="rounded bg-brand-cloudDancer/60 px-1.5 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
              via {row.source}
            </span>
          ) : null}
          <span className={clsx("rounded px-2 py-0.5 text-[11px] font-semibold", CHIP[row.status])}>
            {offerStatusLabel(row.status)}
          </span>
        </div>
      </div>

      {needsOnboarding ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-brand-gold/30 pt-2">
          <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">
            Signed, but not in onboarding yet.
          </span>
          <Link
            href={`/candidates/${row.candidateId}`}
            className="inline-flex items-center gap-1 rounded bg-brand-gold px-2.5 py-1 text-[11px] font-semibold text-brand-black transition hover:bg-brand-gold/90 dark:text-slate-100"
          >
            Move them in <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : row.hireId ? (
        <div className="mt-2 border-t border-brand-lea/10 pt-2 dark:border-white/10">
          <Link
            href={`/people/${row.hireId}`}
            className="text-[11px] font-semibold text-brand-eden hover:underline dark:text-slate-300"
          >
            In onboarding — view record
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function OffersWorkspace({ board }: { board: OffersBoard }) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const rows = useMemo(
    () => (filter === "ALL" ? board.rows : board.rows.filter((r) => r.status === filter)),
    [board.rows, filter]
  );

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: "ALL", label: "All", count: board.rows.length },
    { key: "SENT", label: "Out", count: board.counts.sent },
    { key: "SIGNED", label: "Signed", count: board.counts.signed },
    { key: "STARTED", label: "Started", count: board.counts.started },
    { key: "PLANNED", label: "Planned", count: board.counts.planned },
    { key: "DECLINED", label: "Declined", count: board.counts.declined },
    { key: "NOT_SENT", label: "Not sent", count: board.counts.notSent }
  ];

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Recruiting</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">
          <FileSignature className="h-5 w-5 text-brand-gold" />
          Offers
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-brand-grey dark:text-slate-400">
          Every offer, from planned to signed. An offer is the last step of recruiting — once it is signed, the person
          moves into onboarding. Pay is not tracked here; Paycom owns compensation.
        </p>

        {board.awaitingOnboarding > 0 && (
          <div className="mt-3 rounded border border-brand-gold/40 bg-brand-sweet/12 px-3 py-2 text-sm text-brand-lea dark:bg-brand-gold/10 dark:text-slate-100">
            <span className="font-semibold">{board.awaitingOnboarding}</span> signed offer
            {board.awaitingOnboarding === 1 ? " is" : "s are"} not in onboarding yet.
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={clsx(
              "rounded px-3 py-1.5 text-xs font-semibold transition hover:shadow-glow",
              filter === t.key
                ? "bg-brand-lea text-white dark:bg-brand-gold dark:text-brand-black"
                : "border border-brand-lea/15 bg-white text-brand-grey hover:bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
            )}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <section className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
            {board.rows.length === 0 ? "No offers yet" : "Nothing in this state"}
          </p>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            {board.rows.length === 0
              ? "Mark an offer on a candidate's application and it will appear here."
              : "Try another filter."}
          </p>
        </section>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <OfferCard key={r.applicationId} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
