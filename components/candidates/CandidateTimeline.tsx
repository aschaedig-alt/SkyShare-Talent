"use client";

import { clsx } from "clsx";
import type { CandidateProfileData } from "@/lib/data/candidates";
import { offerStatusLabel } from "@/lib/offers/constants";
import { formatMomentDate } from "@/lib/dates/display";

type CandidateTimelineProps = {
  events: CandidateProfileData["timeline"];
};

function formatDate(value: string) {
  return formatMomentDate(value);
}

// An OFFER timeline entry is titled "<status label> — <job>" by
// recordOfferStatus, so the label is what tells the two endings apart here.
// Read from the constants rather than typed out, so re-wording a status cannot
// silently turn a dead offer gold again.
const DECLINED_TITLE = offerStatusLabel("DECLINED");
const NOT_SENT_TITLE = offerStatusLabel("NOT_SENT");

// Dot color by lifecycle type — gold for positive milestones, red for rejection,
// navy for the rest. Keeps the chronology scannable at a glance.
//
// An OFFER event is gold EXCEPT for the two that ended it: a dead offer glowing
// gold reads as good news at a glance, which is the opposite of true. Red keeps
// meaning the candidate said no; grey means it stopped on our side. That
// distinction is the whole reason the not-sent state exists, so the timeline —
// where somebody reads this history a year later — has to keep it.
function dotClass(type: string, title: string) {
  if (type === "OFFER" && title.startsWith(NOT_SENT_TITLE)) return "bg-slate-400";
  if (type === "OFFER" && title.startsWith(DECLINED_TITLE)) return "bg-red-500";
  if (type === "HIRED" || type === "OFFER") return "bg-brand-gold";
  if (type === "REJECTED") return "bg-red-500";
  return "bg-brand-eden";
}

const TYPE_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  INTERVIEWED: "Interviewed",
  OFFER: "Offer",
  REJECTED: "Not selected",
  HIRED: "Hired",
  NOTE: "Note",
  INTERVIEW_NOTE: "Interview note",
  RESUME_UPLOADED: "Resume uploaded",
  CERT_UPDATED: "Certificate updated"
};

export function CandidateTimeline({ events }: CandidateTimelineProps) {
  const sorted = [...events].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Timeline</p>
      {sorted.length === 0 ? (
        <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm dark:border-white/10 dark:bg-white/5">
          <div className="font-semibold text-brand-lea dark:text-slate-100">No timeline yet</div>
          <p className="mt-1 text-brand-grey dark:text-slate-400">
            Lifecycle events appear here as applications, interviews, notes, and documents are added or imported.
          </p>
        </div>
      ) : (
        <ol className="relative mt-4 space-y-4 border-l border-brand-lea/15 pl-5 dark:border-white/10">
          {sorted.map((event) => (
            <li key={event.id} className="relative">
              <span
                className={clsx(
                  "absolute -left-[1.55rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-brand-panel",
                  dotClass(event.type, event.title)
                )}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                  {/* "Offer" alone, on the row that says the offer was never
                      sent, is the one place this reads as a contradiction. */}
                  {event.type === "OFFER" && event.title.startsWith(NOT_SENT_TITLE)
                    ? "Offer stopped"
                    : (TYPE_LABEL[event.type] ?? event.type)}
                </span>
                <span className="text-xs text-brand-grey dark:text-slate-400">{formatDate(event.occurredAt)}</span>
              </div>
              <p className="mt-0.5 text-sm text-brand-grey dark:text-slate-400">{event.title}</p>
              {event.detail && <p className="text-xs text-brand-grey dark:text-slate-500">{event.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
