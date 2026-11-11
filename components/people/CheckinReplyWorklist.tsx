"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { formatMomentDateShort } from "@/lib/dates/display";
import { REPLY_CATEGORY_LABEL, needsFollowUp, type CheckinReplyView } from "@/lib/onboarding/checkin-reply";
import { CheckinReplyModal, LevelChip } from "@/components/people/CheckinReplyModal";

/**
 * Check-in replies that need somebody: "Needs action" and "Talk to HR today",
 * until HR marks them handled (his answer, 2026-11-11: yes, put them on the
 * worklist). Loads itself, and shows nothing at all when there is nothing open -
 * or for a non-HR session, which the route refuses.
 */
export function CheckinReplyWorklist() {
  const [replies, setReplies] = useState<CheckinReplyView[] | null>(null);
  const [open, setOpen] = useState<CheckinReplyView | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/onboarding/checkin-replies?open=1")
      .then((r) => (r.ok ? r.json() : { replies: [] }))
      .then((d: { replies?: CheckinReplyView[] }) => {
        if (live) setReplies(d.replies ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!replies?.length) return null;
  // Talk-to-HR first, then oldest first: the longest-waiting concern is the one most overdue.
  const sorted = [...replies].sort((a, b) => (a.level === b.level ? a.receivedAt.localeCompare(b.receivedAt) : a.level === "hr" ? -1 : 1));

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center gap-2">
        <MessageSquareWarning className="h-4 w-4 text-brand-gold" />
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Check-in replies to follow up · {replies.length}</h2>
      </div>
      <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">Replies to the check-in emails that Claude marked as needing someone. Open one to read it, change the call, or mark it handled.</p>
      <div className="mt-2 divide-y divide-brand-lea/5 dark:divide-white/10">
        {sorted.map((r) => (
          <div key={r.messageId} className="flex items-center gap-3 rounded px-4 py-2.5 text-sm transition-shadow hover:shadow-glow">
            <LevelChip level={r.level} />
            <button type="button" onClick={() => setOpen(r)} className="min-w-0 flex-1 truncate text-left" title={r.triage.summary}>
              <span className="font-semibold text-brand-lea dark:text-slate-100">{r.hireName ?? "Unknown person"}</span>
              <span className="text-brand-grey dark:text-slate-400"> · {r.triage.summary}</span>
            </button>
            {r.triage.category !== "none" ? (
              <span className="hidden shrink-0 text-[11px] text-brand-eden sm:inline dark:text-slate-300">{REPLY_CATEGORY_LABEL[r.triage.category]}</span>
            ) : null}
            <span className="w-14 shrink-0 text-right text-xs text-brand-grey dark:text-slate-400">{formatMomentDateShort(r.receivedAt)}</span>
            <Link href={`/people/${r.hireId}`} className="shrink-0 text-[11px] font-semibold text-brand-gold hover:underline">
              Profile
            </Link>
          </div>
        ))}
      </div>
      {open ? (
        <CheckinReplyModal
          key={open.messageId}
          reply={open}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setOpen(saved);
            setReplies((cur) => (cur ?? []).map((x) => (x.messageId === saved.messageId ? saved : x)).filter((x) => x.messageId === saved.messageId || (needsFollowUp(x.level) && !x.handledAt)));
          }}
        />
      ) : null}
    </section>
  );
}

/** Every check-in reply from one person, newest first, for their profile. Hidden when there are none. */
export function CheckinRepliesPanel({ newHireId }: { newHireId: string }) {
  const [replies, setReplies] = useState<CheckinReplyView[]>([]);
  const [open, setOpen] = useState<CheckinReplyView | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/onboarding/checkin-replies?ids=${encodeURIComponent(newHireId)}`)
      .then((r) => (r.ok ? r.json() : { replies: [] }))
      .then((d: { replies?: CheckinReplyView[] }) => {
        if (live) setReplies(d.replies ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [newHireId]);

  if (!replies.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Check-in email replies</p>
      <div className="mt-1 grid gap-1.5">
        {replies.map((r) => (
          <button
            key={r.messageId}
            type="button"
            onClick={() => setOpen(r)}
            className="flex items-start gap-2 rounded border border-brand-lea/10 px-3 py-2 text-left text-sm transition hover:shadow-glow dark:border-white/10"
          >
            <LevelChip level={r.level} handled={needsFollowUp(r.level) && Boolean(r.handledAt)} />
            <span className="min-w-0 flex-1">
              <span className="text-xs text-brand-grey dark:text-slate-400">
                {r.taskKey.replace("checkin_", "")}-day · {formatMomentDateShort(r.receivedAt)}
              </span>
              <span className="block text-brand-lea dark:text-slate-100">{r.triage.summary}</span>
            </span>
          </button>
        ))}
      </div>
      {open ? (
        <CheckinReplyModal
          key={open.messageId}
          reply={open}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setOpen(saved);
            setReplies((cur) => cur.map((x) => (x.messageId === saved.messageId ? saved : x)));
          }}
        />
      ) : null}
    </div>
  );
}
