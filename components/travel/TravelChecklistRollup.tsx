"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, ChevronDown, ChevronRight, Check, Clock } from "lucide-react";
import type { TravelChecklistRollup as Rollup, TripChecklistSummary } from "@/lib/travel/rollup";

// Across-all-trips checklist view for the Travel page.
//
// The per-trip checklist could only be reached by opening the trip it belonged
// to, so "is anything about to be missed?" meant opening every trip in turn —
// which is the question this page exists to answer. Same idea as the New hires
// worklist.
//
// Trips are collapsed to one line each and expand in place. That is a detail
// pane on the same page, so the expander is a button; the traveller's name and
// the trip itself are real Links, because those change the whole screen.

function formatDate(iso: string | null): string {
  if (!iso) return "No dates yet";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(iso));
}

function TripRow({ trip, defaultOpen }: { trip: TripChecklistSummary; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const done = trip.outstanding.length === 0;
  const pct = trip.progress.total > 0 ? Math.round((trip.progress.done / trip.progress.total) * 100) : 0;

  return (
    <div className="rounded border-[0.5px] border-brand-lea/15 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 text-brand-grey transition hover:text-brand-lea dark:text-slate-400 dark:hover:text-slate-100"
          title={open ? "Hide what is left" : "Show what is left"}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <Link href={trip.travelerHref} className="font-semibold text-brand-lea hover:underline dark:text-slate-100">
          {trip.travelerName}
        </Link>
        <span className="text-xs text-brand-grey dark:text-slate-400">
          {trip.purpose.toLowerCase().replace(/_/g, " ")}
          {trip.destination ? ` · ${trip.destination}` : ""} · {formatDate(trip.startsAt)}
        </span>

        <span className="ml-auto flex items-center gap-2">
          {done ? (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Check className="h-3 w-3" /> Nothing outstanding
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
              {trip.outstanding.length} left
            </span>
          )}
          <span className="text-xs tabular-nums text-brand-grey dark:text-slate-400">
            {trip.progress.done}/{trip.progress.total}
          </span>
          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-brand-lea/10 sm:block dark:bg-white/10">
            <span className="block h-full rounded-full bg-brand-gold" style={{ width: `${pct}%` }} />
          </span>
        </span>
      </div>

      {open ? (
        <div className="border-t-[0.5px] border-brand-lea/10 px-3 py-2.5 dark:border-white/10">
          {trip.outstanding.length === 0 ? (
            <p className="text-sm text-brand-grey dark:text-slate-400">Everything on this trip&apos;s checklist is done.</p>
          ) : (
            <ul className="space-y-1.5">
              {trip.outstanding.map((item) => (
                <li key={item.key} className="text-sm text-brand-lea dark:text-slate-200">
                  <span className="mr-2 text-brand-gold">•</span>
                  {item.label}
                  {item.note ? <span className="text-brand-grey dark:text-slate-400"> — {item.note}</span> : null}
                </li>
              ))}
            </ul>
          )}

          {/* Waiting-on items are listed apart and never counted as outstanding.
              They are not anybody here's to finish, and mixing them in would
              make a trip look neglected when it is actually blocked. */}
          {trip.waiting.length > 0 ? (
            <div className="mt-3 border-t-[0.5px] border-brand-lea/10 pt-2.5 dark:border-white/10">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                <Clock className="h-3 w-3" /> Waiting on someone else
              </p>
              <ul className="space-y-1">
                {trip.waiting.map((item) => (
                  <li key={item.key} className="text-sm text-brand-grey dark:text-slate-400">
                    {item.label} — {item.waitingOn}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link
            href={`${trip.travelerHref}#travel`}
            className="mt-3 inline-block text-xs font-semibold text-brand-lea underline underline-offset-2 dark:text-slate-200"
          >
            Open this trip
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function TravelChecklistRollup({ rollup }: { rollup: Rollup }) {
  const [showDone, setShowDone] = useState(false);
  const open = rollup.trips.filter((t) => t.outstanding.length > 0);
  const finished = rollup.trips.filter((t) => t.outstanding.length === 0);
  const shown = showDone ? [...open, ...finished] : open;

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium text-brand-lea dark:text-slate-100">
            <ClipboardList className="h-5 w-5 text-brand-gold" />
            What is left, across every trip
          </h2>
          <p className="mt-0.5 text-sm text-brand-grey dark:text-slate-400">
            {rollup.totals.trips === 0
              ? "No trips to track yet."
              : rollup.totals.outstanding === 0
                ? `All ${rollup.totals.trips} trips are fully checked off.`
                : `${rollup.totals.outstanding} thing${rollup.totals.outstanding === 1 ? "" : "s"} outstanding across ${open.length} of ${rollup.totals.trips} trips.` +
                  (rollup.totals.waiting > 0 ? ` ${rollup.totals.waiting} more are waiting on somebody else.` : "")}
          </p>
        </div>
        {finished.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="rounded border-[0.5px] border-brand-lea/20 px-3 py-1.5 text-xs font-medium text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
          >
            {showDone ? "Hide" : "Show"} {finished.length} finished
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-brand-grey dark:text-slate-400">
          {rollup.totals.trips === 0 ? "Add a trip from a hire or candidate record." : "Nothing outstanding on any trip."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((trip, i) => (
            // The most urgent trip opens by itself — a roll-up you have to click
            // into to learn anything is barely better than the per-trip view.
            <TripRow key={trip.tripId} trip={trip} defaultOpen={i === 0 && trip.outstanding.length > 0} />
          ))}
        </div>
      )}
    </section>
  );
}
