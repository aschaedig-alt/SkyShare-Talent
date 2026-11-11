"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatMomentDateTime } from "@/lib/dates/display";
import { REPLY_CATEGORY_LABEL, REPLY_LEVEL_LABEL, REPLY_LEVELS, needsFollowUp, type CheckinReplyView, type ReplyLevel } from "@/lib/onboarding/checkin-reply";

/** One style per level, shared by the grid icon, the dialog and the worklist. */
export const LEVEL_STYLE: Record<ReplyLevel, { chip: string; icon: string }> = {
  ok: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
    icon: "text-emerald-600 dark:text-emerald-300"
  },
  fyi: {
    chip: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
    icon: "text-sky-600 dark:text-sky-300"
  },
  action: {
    chip: "border-brand-gold/50 bg-brand-gold/15 text-brand-lea dark:border-brand-gold/40 dark:bg-brand-gold/15 dark:text-amber-200",
    icon: "text-brand-gold"
  },
  hr: {
    chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300",
    icon: "text-red-600 dark:text-red-300"
  }
};

export function LevelChip({ level, handled }: { level: ReplyLevel; handled?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", handled ? "border-brand-lea/20 bg-brand-lea text-white dark:border-white/10 dark:bg-brand-lea" : LEVEL_STYLE[level].chip)}>
      {handled ? "Handled" : REPLY_LEVEL_LABEL[level]}
    </span>
  );
}

export async function patchReply(body: { messageId: string; handled?: boolean; note?: string | null; level?: ReplyLevel | null }): Promise<CheckinReplyView> {
  const res = await fetch("/api/onboarding/checkin-replies", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as { reply?: CheckinReplyView; message?: string };
  if (!res.ok || !data.reply) throw new Error(data.message || "Could not save.");
  return data.reply;
}

/** The full reply, Claude's read, and HR's final call on it. */
export function CheckinReplyModal({
  reply,
  onClose,
  onSaved
}: {
  reply: CheckinReplyView;
  onClose: () => void;
  onSaved: (r: CheckinReplyView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(reply.handledNote ?? "");
  const handled = Boolean(reply.handledAt);
  const name = reply.hireName ?? "this person";

  async function save(change: { handled?: boolean; level?: ReplyLevel | null }) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await patchReply({ messageId: reply.messageId, ...change, ...(change.handled ? { note } : {}) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} busy={busy} maxWidth="max-w-2xl" title={`Check-in reply from ${name}`}>
      <div className="p-5 text-left">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Check-in reply: {name}</h2>
            <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
              {formatMomentDateTime(reply.receivedAt)} · {reply.fromName || reply.fromEmail || "unknown sender"}
              {reply.fromEmail && reply.fromName ? ` <${reply.fromEmail}>` : ""}
              {reply.foundBy === "search" ? " · sent as a new email, not a reply in the thread" : ""}
            </p>
            {reply.fromSomeoneElse ? (
              <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">Sent from an address that is not on {name}&apos;s record.</p>
            ) : null}
          </div>
          <a
            href={reply.frontUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100"
          >
            Open in Front <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center gap-2">
            <LevelChip level={reply.level} handled={handled} />
            {reply.triage.category !== "none" ? <span className="text-[11px] font-semibold text-brand-eden dark:text-slate-300">{REPLY_CATEGORY_LABEL[reply.triage.category]}</span> : null}
            <span className="text-[11px] text-brand-grey dark:text-slate-400">
              {reply.triage.source === "ai" ? "Sorted by Claude" : "Not sorted automatically"}
              {reply.levelOverride ? ` · changed to ${REPLY_LEVEL_LABEL[reply.levelOverride]}${reply.overrideBy ? ` by ${reply.overrideBy}` : ""} (Claude said ${REPLY_LEVEL_LABEL[reply.triage.level]})` : ""}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-brand-lea dark:text-slate-100">{reply.triage.summary}</p>
          {reply.triage.suggestedStep ? (
            <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
              <span className="font-semibold">Suggested:</span> {reply.triage.suggestedStep}
            </p>
          ) : null}
        </div>

        <div className="mt-3 whitespace-pre-wrap break-words rounded border border-brand-lea/10 p-3 text-sm leading-relaxed text-brand-lea dark:border-white/10 dark:text-slate-100">
          {reply.text || "(empty reply)"}
        </div>

        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Your call</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {REPLY_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                disabled={busy}
                onClick={() => void save({ level: l })}
                className={clsx(
                  "rounded border px-2.5 py-1 text-[11px] font-semibold transition hover:shadow-glow",
                  reply.level === l ? "border-brand-lea bg-brand-lea text-white ring-2 ring-brand-gold" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                )}
              >
                {REPLY_LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
        </div>

        {needsFollowUp(reply.level) || handled ? (
          <div className="mt-4 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            {handled ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-brand-grey dark:text-slate-400">
                  Handled{reply.handledBy ? ` by ${reply.handledBy}` : ""} on {formatMomentDateTime(reply.handledAt)}
                  {reply.handledNote ? <span className="mt-0.5 block text-brand-lea dark:text-slate-100">{reply.handledNote}</span> : null}
                </p>
                <button type="button" disabled={busy} onClick={() => void save({ handled: false })} className="rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100">
                  Reopen
                </button>
              </div>
            ) : (
              <div className="grid gap-2">
                <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
                  What was done (optional)
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                    placeholder="e.g. Called them 11/12, looped in their lead"
                    className="rounded border border-brand-lea/20 bg-white px-2 py-1.5 text-sm font-normal text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
                  />
                </label>
                <div className="flex justify-end">
                  <button type="button" disabled={busy} onClick={() => void save({ handled: true })} className="rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:shadow-glow disabled:opacity-60">
                    Mark handled
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {error ? <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{error}</p> : null}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
