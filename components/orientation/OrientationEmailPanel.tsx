"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Clock } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { AUDIENCE_LABEL, ORIENTATION_TEMPLATE_META, type OrientationTemplateKey, type OrientationTemplateMeta } from "@/lib/orientation/email-templates-meta";
import { frontConversationUrl } from "@/lib/front/links";
import {
  previewOrientationEmail,
  previewOrientationEmailBatch,
  previewOrientationSupervisorBatch,
  sendOrientationEmail,
  sendOrientationEmailBatch,
  sendOrientationSupervisorBatch,
  previewOrientationSummary,
  sendOrientationSummary,
  type OrientationBatchRow,
  type OrientationSummaryResult,
  type SupervisorDigestRow
} from "@/app/orientation/actions";
import type { OrientationEmailPreview } from "@/lib/front/orientation-email";

// Sending orientation email, and tracking who has had what.
//
// Two deliberate rules, because a send is irreversible and lands in a real new
// hire's inbox:
//  1. Nothing sends without a PREVIEW of the exact email, approved first.
//  2. A test send goes to ONE address with no cc, and never ticks the grid.
//
// The tick itself stays hand-toggleable: an email sent from Front directly still
// needs recording, so the checkbox is not disabled just because a Send button exists.
//
// Rule 1 only works if you can see WHICH email a button sends BEFORE clicking it.
// The three templates are near-identically named and two of the three go to the
// new hire while the middle one goes to their supervisor, so "2. Supervisors" in a
// column header is not enough. Hence the legend below, and the audience chip on
// every column: the recipient is on the page at all times, never hover-only.

type SendRecord = {
  sentAt: string;
  to: string;
  cc?: string;
  subject?: string;
  sentBy?: string | null;
  conversationId?: string;
};
type AttendeeRow = {
  id: string;
  name: string;
  sentTemplateKeys: string[];
  /** templateKey -> what the APP sent. Absent = ticked by hand. */
  sends: Record<string, SendRecord>;
};

/** "Jul 27" — short enough for a grid cell. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", month: "short", day: "numeric" }).format(d);
}

/**
 * "Mon, Aug 3" from a YYYY-MM-DD send day, for the column chip.
 *
 * UTC, NOT the office zone — unlike shortDate above, which formats a real
 * moment. sendOnKey is a calendar day, so it parses to midnight UTC, and
 * reading midnight UTC in Mountain lands at 6pm the PREVIOUS day. Formatting
 * this one in America/Denver would label the Aug 3 send as Aug 2.
 */
function shortSendDay(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(d);
}

function fullSentLabel(r: SendRecord): string {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(r.sentAt));
  // `to` is empty for the optimistic record set right after a send, before the
  // page refetches — say less rather than "to " with nothing after it.
  return `Sent from the app on ${when} MT${r.to ? ` to ${r.to}` : ""}${r.sentBy ? ` by ${r.sentBy}` : ""}.`;
}

/** Colour by WHO RECEIVES IT — the one distinction that makes a misfire expensive.
    Navy for the new hire, gold for the supervisor; amber stays reserved for
    warnings elsewhere in this panel so the two never read as the same signal. */
function audienceChipClass(audience: OrientationTemplateMeta["audience"]): string {
  return audience === "supervisor"
    ? "bg-brand-gold/25 text-brand-lea ring-1 ring-brand-gold/40 dark:bg-brand-gold/20 dark:text-brand-gold"
    : "bg-brand-sweet/40 text-brand-lea ring-1 ring-brand-lea/15 dark:bg-brand-sweet/20 dark:text-brand-sweet";
}

/** The always-on "who gets this" pill. A rectangle, per the design system. */
function AudienceChip({ audience, className }: { audience: OrientationTemplateMeta["audience"]; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        audienceChipClass(audience),
        className
      )}
    >
      → {AUDIENCE_LABEL[audience]}
    </span>
  );
}

/** What each button will send, spelled out on the page. This is the "refresher"
    surface: three cards you can read at a glance instead of remembering which
    numbered template is which. */
function TemplateLegend() {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {ORIENTATION_TEMPLATE_META.map((t) => (
        <div
          key={t.key}
          className={clsx(
            "rounded border p-2.5",
            t.audience === "supervisor"
              ? "border-brand-gold/40 bg-brand-gold/5 dark:border-brand-gold/30 dark:bg-brand-gold/10"
              : "border-brand-lea/15 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5"
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-brand-lea dark:text-slate-100">{t.label}</span>
            <AudienceChip audience={t.audience} />
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-brand-black dark:text-slate-300">{t.purpose}</p>
          <dl className="mt-1.5 space-y-0.5 text-[11px] text-brand-grey dark:text-slate-400">
            <div className="flex gap-1.5">
              <dt className="w-5 shrink-0 font-bold uppercase tracking-wide">To</dt>
              <dd className="min-w-0 flex-1">{t.toLabel}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="w-5 shrink-0 font-bold uppercase tracking-wide">Cc</dt>
              <dd className="min-w-0 flex-1">{t.ccLabel}</dd>
            </div>
          </dl>
          <p className="mt-1.5 border-t border-brand-lea/10 pt-1 text-[10.5px] text-brand-grey dark:border-white/10 dark:text-slate-500">
            Front template: {t.frontName}
          </p>
        </div>
      ))}
    </div>
  );
}

export function OrientationEmailPanel({
  sessionId,
  attendees,
  onToggle,
  onSent
}: {
  sessionId: string;
  attendees: AttendeeRow[];
  /** Resolves once the tick is SAVED — see markCount below for why that matters. */
  onToggle: (attendeeId: string, key: string) => void | Promise<void>;
  /** Called after a real send so the parent can refresh its state. */
  onSent: (attendeeId: string, key: OrientationTemplateKey) => void;
}) {
  const [target, setTarget] = useState<{ attendee: AttendeeRow; key: OrientationTemplateKey } | null>(null);
  // Bulk selection. Sending the invitation one dialog at a time meant seven
  // dialogs for one session, which is how a person gets missed.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchKey, setBatchKey] = useState<OrientationTemplateKey | null>(null);

  // Armed state lives HERE rather than inside the scheduler, because the grid
  // needs it too. With it hidden below, an armed session showed a column of
  // empty "not sent" circles — which is the same thing the grid shows when
  // nothing is going to happen at all. Six people were queued and the column
  // said nothing about it.
  const [reminder, setReminder] = useState<ReminderStatusView | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/orientation/sessions/${sessionId}/reminder`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setReminder(d?.sendOnLabel ? d : null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sessionId]);

  /** The reminder is queued to go out and this person has not had it yet. */
  const reminderQueued = Boolean(reminder?.armed && !reminder.passed);

  // Bumped every time a box is ticked BY HAND, and threaded into the two panels
  // below the grid so they re-read the server.
  //
  // Both of them conclude things FROM sentTemplateKeys — "X has not been sent the
  // invitation yet", "the send day passed with N still unsent" — and both used to
  // load once on mount and never again. So ticking a box left them asserting the
  // exact opposite of the grid directly above them, with a page reload as the only
  // cure and nothing on screen suggesting one was needed.
  //
  // That bites hardest in the case the hand-tick exists for: somebody added to a
  // session late, after the send day, who was already contacted outside the app.
  // You tick all three boxes to say "she is covered" and the page keeps insisting
  // she is not — which is the one situation where a false "unsent" costs a real
  // duplicate email to a new hire.
  //
  // Awaited, not fire-and-forget: refetching before the PATCH commits reads the
  // pre-tick row back and re-renders the stale warning as if it were fresh.
  const [markCount, setMarkCount] = useState(0);
  const handleToggle = useCallback(
    async (attendeeId: string, key: string) => {
      await onToggle(attendeeId, key);
      setMarkCount((n) => n + 1);
    },
    [onToggle]
  );

  const allSelected = attendees.length > 0 && selected.size === attendees.length;
  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Orientation email</h2>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        Sends the team&apos;s own Front templates, from hrotasks@. The wording is whatever the template says in Front right now —
        the app fills in the date, the recipients, and strips the red &ldquo;delete this part&rdquo; note.
      </p>
      <p className="mt-1.5 rounded border border-brand-lea/15 bg-brand-cloudDancer/50 px-2.5 py-1.5 text-[12px] font-semibold text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
        Nothing sends on the first click. &ldquo;Send&hellip;&rdquo; opens the full email &mdash; recipients, subject and body &mdash; and you approve it there.
      </p>
      {/* Says the quiet part out loud, because "nobody is cc'd" reads like something
          is missing unless you know where those people are being reached instead. */}
      <p className="mt-1.5 text-[11.5px] text-brand-grey dark:text-slate-400">
        <b>Nobody is cc&apos;d on these.</b> Each one goes to one person. Supervisors are reached once by
        &ldquo;2. Supervisors&rdquo;, which names every hire they cover, and the internal list gets the session summary
        below &mdash; a cc here would give each of them one copy per new hire.
      </p>

      <TemplateLegend />

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
              <th className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(attendees.map((a) => a.id)))}
                  aria-label={allSelected ? "Clear selection" : "Select every attendee"}
                  title={allSelected ? "Clear selection" : "Select every attendee"}
                />
              </th>
              <th className="py-2 pr-3">Attendee</th>
              {ORIENTATION_TEMPLATE_META.map((t) => (
                <th key={t.key} className="px-2 py-2 text-center align-bottom" style={{ minWidth: 132 }} title={t.hint}>
                  <div className="flex flex-col items-center gap-1">
                    <span>{t.label}</span>
                    {/* Repeated from the legend on purpose: when you are scanning
                        rows, the column header is the only thing in view. */}
                    <AudienceChip audience={t.audience} className="normal-case" />
                    {/* Same reasoning, one step further: the fact that this
                        column is going to fill itself in belongs AT the column,
                        not in a box below two other sections. */}
                    {t.key === "reminder" && reminderQueued && reminder ? (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-brand-gold/20 px-1.5 py-0.5 text-[9.5px] font-bold normal-case tracking-normal text-brand-lea dark:text-slate-100"
                        title={`Queued — the app sends this automatically on ${reminder.sendOnLabel}, to everyone who has not had it`}
                      >
                        <Clock className="h-2.5 w-2.5" />
                        Auto · {shortSendDay(reminder.sendOnKey)}
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attendees.map((a) => (
              <tr key={a.id} className="border-t border-brand-lea/10 dark:border-white/10">
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggleOne(a.id)}
                    aria-label={`Select ${a.name}`}
                  />
                </td>
                <td className="py-2 pr-3 font-medium text-brand-lea dark:text-slate-100">{a.name}</td>
                {ORIENTATION_TEMPLATE_META.map((t) => {
                  const sent = a.sentTemplateKeys.includes(t.key);
                  const record = a.sends[t.key];
                  // Three states, not two. "The app sent it, here is when" is a
                  // different fact from "somebody ticked a box", and the grid used
                  // to render both as the same green tick.
                  return (
                    <td key={t.key} className="px-2 py-2 align-top">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => void handleToggle(a.id, t.key)}
                            aria-label={sent ? `Mark ${t.label} as not sent for ${a.name}` : `Mark ${t.label} as sent for ${a.name}`}
                            title={
                              record
                                ? fullSentLabel(record)
                                : sent
                                  ? "Marked by hand — the app has no record of sending this. Click to un-mark."
                                  : "Tick by hand — for an email you sent from Front directly"
                            }
                            className="inline-flex items-center justify-center rounded p-0.5 transition hover:bg-brand-gold/10"
                          >
                            {record ? (
                              // Sent by the app and confirmed by Front: solid.
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                                <svg width="11" height="11" viewBox="0 0 12 12">
                                  <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            ) : sent ? (
                              // Ticked by hand: outlined, deliberately weaker.
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-emerald-600 text-emerald-700 dark:text-emerald-400">
                                <svg width="10" height="10" viewBox="0 0 12 12">
                                  <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            ) : t.key === "reminder" && reminderQueued ? (
                              // Queued, not idle. An empty grey ring here says
                              // "nothing is happening", which was the opposite
                              // of the truth for six people.
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-dashed border-brand-gold text-brand-gold">
                                <Clock className="h-2.5 w-2.5" />
                              </span>
                            ) : (
                              <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/30" />
                            )}
                          </button>
                          <button
                            onClick={() => setTarget({ attendee: a, key: t.key })}
                            className="rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                          >
                            {sent ? "Resend…" : "Send…"}
                          </button>
                        </div>
                        {record ? (
                          <span
                            className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
                            title={fullSentLabel(record)}
                          >
                            {shortDate(record.sentAt)}
                          </span>
                        ) : sent ? (
                          <span className="text-[10px] text-brand-grey dark:text-slate-400">by hand</span>
                        ) : t.key === "reminder" && reminderQueued && reminder ? (
                          <span
                            className="text-[10px] font-semibold text-brand-gold"
                            title={`Sends automatically on ${reminder.sendOnLabel}`}
                          >
                            queued
                          </span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* What the two marks mean. Without this the outlined tick just looks like a
          rendering glitch rather than "nobody has evidence this was sent". */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-brand-grey dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg width="9" height="9" viewBox="0 0 12 12">
              <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Sent from here — hover for when and to whom
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-emerald-600 text-emerald-700 dark:text-emerald-400">
            <svg width="8" height="8" viewBox="0 0 12 12">
              <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Ticked by hand — no record of the app sending it
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-brand-grey/30" />
          Not sent
        </span>
        {reminderQueued && reminder ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-dashed border-brand-gold text-brand-gold">
              <Clock className="h-2 w-2" />
            </span>
            Queued — the app sends this on {reminder.sendOnLabel}
          </span>
        ) : null}
      </div>

      {/* Directly under the grid, because it is what the Reminder column above
          is doing. It used to sit two sections down, past the internal summary
          and the communication history, so the control and the column it
          governs were never on screen together. */}
      <ReminderScheduler sessionId={sessionId} status={reminder} onStatusChange={setReminder} refreshKey={markCount} />

      {/* Bulk bar. Appears only with a selection, so the default view stays the
          per-person grid and nothing bulk happens by accident. */}
      {selected.size > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-brand-lea/20 bg-brand-cloudDancer/50 p-2.5 dark:border-white/10 dark:bg-white/5">
          <span className="text-[12.5px] font-semibold text-brand-lea dark:text-slate-100">
            {selected.size} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
          >
            Clear
          </button>
          <span className="text-[11px] text-brand-grey dark:text-slate-400">Send to all of them:</span>
          {ORIENTATION_TEMPLATE_META.map((t) => (
            <button
              key={t.key}
              onClick={() => setBatchKey(t.key)}
              className="rounded border border-brand-lea/20 px-2 py-1 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <InternalSummary sessionId={sessionId} refreshKey={markCount} />

      <CommunicationHistory attendees={attendees} />

      <CcEditor />

      {/* Supervisors gets its own dialog: one email per SUPERVISOR rather than one
          per attendee, so a supervisor with four new hires is emailed once. */}
      {batchKey === "supervisors" ? (
        <SupervisorBatchDialog
          attendees={attendees.filter((a) => selected.has(a.id))}
          onClose={() => setBatchKey(null)}
          onSent={(ids) => {
            ids.forEach((id) => onSent(id, "supervisors"));
            setBatchKey(null);
            setSelected(new Set());
          }}
        />
      ) : batchKey ? (
        <BatchDialog
          attendees={attendees.filter((a) => selected.has(a.id))}
          templateKey={batchKey}
          onClose={() => setBatchKey(null)}
          onSent={(ids) => {
            ids.forEach((id) => onSent(id, batchKey));
            setBatchKey(null);
            setSelected(new Set());
          }}
        />
      ) : null}

      {target ? (
        <SendDialog
          attendee={target.attendee}
          allAttendeeIds={attendees.map((a) => a.id)}
          templateKey={target.key}
          onClose={() => setTarget(null)}
          onSent={(key) => {
            onSent(target.attendee.id, key);
            setTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

// --- supervisors, grouped ---------------------------------------------------
//
// Its own dialog rather than a branch inside BatchDialog, because the unit is
// different: rows here are SUPERVISORS, not attendees, and one row can cover
// several new hires. Rendering that through an attendee-shaped table would have
// meant lying about what a row is.

function SupervisorBatchDialog({
  attendees,
  onClose,
  onSent
}: {
  attendees: AttendeeRow[];
  onClose: () => void;
  onSent: (attendeeIds: string[]) => void;
}) {
  const meta = ORIENTATION_TEMPLATE_META.find((t) => t.key === "supervisors")!;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SupervisorDigestRow[] | null>(null);
  const [noSupervisor, setNoSupervisor] = useState<string[]>([]);
  const [sample, setSample] = useState<{ subject?: string; html?: string; for?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [includeAlreadySent, setIncludeAlreadySent] = useState(false);
  const [done, setDone] = useState<{ sent: number; failed: { supervisorEmail: string; error: string }[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    previewOrientationSupervisorBatch(attendees.map((a) => a.id))
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error ?? "Couldn't build the emails.");
          return;
        }
        setRows(res.rows ?? []);
        setNoSupervisor(res.noSupervisor ?? []);
        setSample({ subject: res.sampleSubject, html: res.sampleHtml, for: res.sampleFor });
      })
      .catch(() => !cancelled && setError("Couldn't build the emails."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attendees]);

  const sendable = (rows ?? []).filter((r) => !r.error && (includeAlreadySent || !r.allAlreadySent));
  const blocked = (rows ?? []).filter((r) => r.error);
  const skippedAsSent = (rows ?? []).filter((r) => !r.error && r.allAlreadySent && !includeAlreadySent);

  async function doSend() {
    if (!sendable.length) return;
    const lines = sendable.map((r) => `${r.supervisorName ?? r.supervisorEmail} → ${r.hireNames.join(", ")}`);
    if (
      !confirm(
        `Send "${meta.label}" to ${sendable.length} supervisor${sendable.length === 1 ? "" : "s"}?\n\n${lines.join("\n")}\n\nOne email each. This sends immediately and cannot be undone.`
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    const res = await sendOrientationSupervisorBatch(
      sendable.map((r) => r.supervisorEmail),
      attendees.map((a) => a.id)
    );
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "Send failed.");
      return;
    }
    const ok = res.sent ?? [];
    setDone({ sent: ok.length, failed: res.failed ?? [] });
    const touched = [...new Set(ok.flatMap((s) => s.attendeeIds))];
    if (touched.length) onSent(touched);
  }

  return (
    <Modal open onClose={onClose} busy={sending}>
      <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{meta.label}</h2>
      <div className={clsx("mt-2 rounded px-2.5 py-2 text-[12.5px] leading-snug", audienceChipClass("supervisor"))}>
        <span className="font-bold uppercase tracking-wide">Goes to {AUDIENCE_LABEL.supervisor}</span>
        <span> — one email per supervisor, naming every new hire they cover. The attendees do not receive it.</span>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Building the emails from Front…</p>
      ) : error ? (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </div>
      ) : done ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Sent {done.sent}.{done.failed.length ? ` ${done.failed.length} failed.` : ""}
          </p>
          {done.failed.length ? (
            <ul className="space-y-1 rounded border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
              {done.failed.map((f, i) => (
                <li key={i}>
                  <span className="font-semibold">{f.supervisorEmail}</span> — {f.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : rows ? (
        <div className="mt-4 space-y-2">
          {noSupervisor.length ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              No supervisor on file for {noSupervisor.join(", ")} — nobody to tell about them.
            </div>
          ) : null}
          {blocked.length ? (
            <ul className="space-y-1 rounded border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
              {blocked.map((r) => (
                <li key={r.supervisorEmail}>
                  <span className="font-semibold">{r.supervisorName ?? r.supervisorEmail}</span> skipped — {r.error}
                </li>
              ))}
            </ul>
          ) : null}
          {skippedAsSent.length ? (
            <label className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              <input type="checkbox" checked={includeAlreadySent} onChange={(e) => setIncludeAlreadySent(e.target.checked)} />
              <span>
                {skippedAsSent.map((r) => r.supervisorName ?? r.supervisorEmail).join(", ")} already had this — skipping.
                Tick to send again.
              </span>
            </label>
          ) : null}

          <div className="max-h-56 overflow-y-auto rounded border border-brand-lea/15 dark:border-white/10">
            <table className="min-w-full text-[12px]">
              <tbody>
                {sendable.map((r) => (
                  <tr key={r.supervisorEmail} className="border-b border-brand-lea/10 last:border-0 dark:border-white/10">
                    <td className="px-2 py-1.5 font-medium text-brand-lea dark:text-slate-100">
                      {r.supervisorName ?? r.supervisorEmail}
                      <div className="text-[10px] font-normal text-brand-grey dark:text-slate-400">{r.to.join(", ")}</div>
                    </td>
                    <td className="px-2 py-1.5 text-brand-black dark:text-slate-200">
                      {r.hireNames.join(", ")}
                      <span className="ml-1 text-[10px] text-brand-grey dark:text-slate-400">
                        ({r.hireNames.length})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[12px] text-brand-grey dark:text-slate-400">
            {sendable.length} email{sendable.length === 1 ? "" : "s"} — one per supervisor, instead of one per attendee.
          </p>

          {sample?.html ? (
            <>
              <button
                onClick={() => setShowBody((v) => !v)}
                className="text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
              >
                {showBody ? "Hide" : "Show"} the email {sample.for ? `(as ${sample.for} will get it)` : ""}
              </button>
              {showBody ? (
                <div className="max-h-56 overflow-y-auto rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-[#0f2033]">
                  <p className="mb-2 text-[12px] font-semibold text-brand-lea dark:text-slate-100">{sample.subject}</p>
                  <div
                    className="prose-sm text-[12.5px] text-brand-black dark:text-slate-200"
                    dangerouslySetInnerHTML={{ __html: sample.html }}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={sending}>
          {done ? "Close" : "Cancel"}
        </Button>
        {!done ? (
          <Button onClick={doSend} disabled={sending || loading || sendable.length === 0}>
            {sending ? `Sending ${sendable.length}…` : `Send to ${sendable.length} supervisor${sendable.length === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

// --- the batch preview + send dialog ----------------------------------------
//
// Same rule as the single send: nothing goes out without the exact emails being
// approved first. What changes is that "the exact email" is now N of them, so the
// dialog shows every recipient row (including who will be SKIPPED and why) and
// one representative body — reading the same template seven times proves nothing.

function BatchDialog({
  attendees,
  templateKey,
  onClose,
  onSent
}: {
  attendees: AttendeeRow[];
  templateKey: OrientationTemplateKey;
  onClose: () => void;
  onSent: (attendeeIds: string[]) => void;
}) {
  const meta = ORIENTATION_TEMPLATE_META.find((t) => t.key === templateKey)!;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OrientationBatchRow[] | null>(null);
  const [sample, setSample] = useState<{ subject?: string; html?: string; for?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [done, setDone] = useState<{ sent: number; failed: { name: string; error: string }[] } | null>(null);
  // Re-sending someone who already had this template is opt-in, so a second run
  // over the same session doesn't quietly email everyone twice.
  const [includeAlreadySent, setIncludeAlreadySent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    previewOrientationEmailBatch(attendees.map((a) => a.id), templateKey)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error ?? "Couldn't build the emails.");
          return;
        }
        setRows(res.rows ?? []);
        setSample({ subject: res.sampleSubject, html: res.sampleHtml, for: res.sampleFor });
      })
      .catch(() => !cancelled && setError("Couldn't build the emails."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attendees, templateKey]);

  const sendable = (rows ?? []).filter((r) => !r.error && (includeAlreadySent || !r.alreadySent));
  const blocked = (rows ?? []).filter((r) => r.error);
  const skippedAsSent = (rows ?? []).filter((r) => !r.error && r.alreadySent && !includeAlreadySent);

  async function doSend() {
    if (!sendable.length) return;
    if (
      !confirm(
        `Send "${meta.label}" to ${sendable.length} ${sendable.length === 1 ? "person" : "people"}?\n\n${sendable.map((r) => `${r.name} → ${r.to.join(", ")}`).join("\n")}\n\nThis sends immediately and cannot be undone.`
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    const res = await sendOrientationEmailBatch(sendable.map((r) => r.attendeeId), templateKey);
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "Send failed.");
      return;
    }
    const ok = res.sent ?? [];
    const bad = res.failed ?? [];
    setDone({ sent: ok.length, failed: bad.map((f) => ({ name: f.name, error: f.error })) });
    // Tick only the ones that really went.
    if (ok.length) onSent(ok.map((s) => s.attendeeId));
  }

  return (
    <Modal open onClose={onClose} busy={sending}>
      <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
        {meta.label} · {attendees.length} selected
      </h2>
      <div className={clsx("mt-2 rounded px-2.5 py-2 text-[12.5px] leading-snug", audienceChipClass(meta.audience))}>
        <span className="font-bold uppercase tracking-wide">Goes to {AUDIENCE_LABEL[meta.audience]}</span>
        {meta.audience === "supervisor" ? (
          <span> — one email per attendee, to their own supervisor. The attendees do not receive it.</span>
        ) : (
          <span> — one personalised email each, not a single email with everyone on it.</span>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Building {attendees.length} emails from Front…</p>
      ) : error ? (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </div>
      ) : done ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Sent {done.sent}.{done.failed.length ? ` ${done.failed.length} failed.` : ""}
          </p>
          {done.failed.length ? (
            <ul className="space-y-1 rounded border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
              {done.failed.map((f, i) => (
                <li key={i}>
                  <span className="font-semibold">{f.name}</span> — {f.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : rows ? (
        <div className="mt-4 space-y-2">
          {blocked.length ? (
            <ul className="space-y-1 rounded border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
              {blocked.map((r) => (
                <li key={r.attendeeId}>
                  <span className="font-semibold">{r.name}</span> will be skipped — {r.error}
                </li>
              ))}
            </ul>
          ) : null}

          {skippedAsSent.length ? (
            <label className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              <input
                type="checkbox"
                checked={includeAlreadySent}
                onChange={(e) => setIncludeAlreadySent(e.target.checked)}
              />
              <span>
                {skippedAsSent.map((r) => r.name).join(", ")} already had this one — skipping them. Tick to send again.
              </span>
            </label>
          ) : null}

          <div className="max-h-56 overflow-y-auto rounded border border-brand-lea/15 dark:border-white/10">
            <table className="min-w-full text-[12px]">
              <tbody>
                {sendable.map((r) => (
                  <tr key={r.attendeeId} className="border-b border-brand-lea/10 last:border-0 dark:border-white/10">
                    <td className="px-2 py-1.5 font-medium text-brand-lea dark:text-slate-100">{r.name}</td>
                    <td className="px-2 py-1.5 text-brand-black dark:text-slate-200">{r.to.join(", ")}</td>
                    <td className="px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                      {r.warnings.length ? r.warnings.join(" ") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[12px] text-brand-grey dark:text-slate-400">
            {sendable.length} will be sent, one each, with nobody cc&apos;d — supervisors get the separate supervisors
            email and the internal list gets the session summary.
          </p>

          {sample?.html ? (
            <>
              <button
                onClick={() => setShowBody((v) => !v)}
                className="text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
              >
                {showBody ? "Hide" : "Show"} the email {sample.for ? `(as ${sample.for} will get it)` : ""}
              </button>
              {showBody ? (
                <div className="max-h-56 overflow-y-auto rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-[#0f2033]">
                  <p className="mb-2 text-[12px] font-semibold text-brand-lea dark:text-slate-100">{sample.subject}</p>
                  <div
                    className="prose-sm text-[12.5px] text-brand-black dark:text-slate-200"
                    dangerouslySetInnerHTML={{ __html: sample.html }}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={sending}>
          {done ? "Close" : "Cancel"}
        </Button>
        {!done ? (
          <Button onClick={doSend} disabled={sending || loading || sendable.length === 0}>
            {sending ? `Sending ${sendable.length}…` : `Send to ${sendable.length}`}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

// --- the preview + send dialog ---------------------------------------------

function SendDialog({
  attendee,
  allAttendeeIds,
  templateKey,
  onClose,
  onSent
}: {
  attendee: AttendeeRow;
  /** Everyone on the session, so a single supervisors send can warn when this
      hire's supervisor also covers others and would collect a copy per hire. */
  allAttendeeIds: string[];
  templateKey: OrientationTemplateKey;
  onClose: () => void;
  onSent: (key: OrientationTemplateKey) => void;
}) {
  const meta = ORIENTATION_TEMPLATE_META.find((t) => t.key === templateKey)!;
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<OrientationEmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // Test mode redirects the whole email to one address and drops every cc.
  const [testMode, setTestMode] = useState(false);
  const [testTo, setTestTo] = useState("hrotasks@skyshare.com");
  // Sending the supervisors email ONE ATTENDEE AT A TIME is the path that
  // reintroduces duplicates: the bulk send groups by supervisor, this one does not.
  // Warn with the real names rather than a generic caution.
  const [sharedWith, setSharedWith] = useState<{ supervisor: string; others: string[] } | null>(null);

  useEffect(() => {
    if (templateKey !== "supervisors") {
      setSharedWith(null);
      return;
    }
    let cancelled = false;
    previewOrientationSupervisorBatch(allAttendeeIds)
      .then((res) => {
        if (cancelled || !res.ok) return;
        const group = (res.rows ?? []).find((r) => r.attendeeIds.includes(attendee.id) && r.hireNames.length > 1);
        if (group) {
          setSharedWith({
            supervisor: group.supervisorName ?? group.supervisorEmail,
            others: group.hireNames.filter((n) => n !== attendee.name)
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [templateKey, allAttendeeIds, attendee.id, attendee.name]);

  // Rebuild the preview whenever the mode changes, so what is on screen is always
  // what would actually be sent under the current settings.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    previewOrientationEmail(attendee.id, templateKey, testMode ? testTo : null)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.preview) setPreview(res.preview);
        else setError(res.error ?? "Couldn't build the email.");
      })
      .catch(() => !cancelled && setError("Couldn't build the email."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attendee.id, templateKey, testMode, testTo]);

  async function doSend() {
    if (!preview) return;
    const who = testMode ? `TEST to ${preview.to.join(", ")}` : `${attendee.name} at ${preview.to.join(", ")}`;
    if (!confirm(`Send "${meta.label}" — ${who}?\n\nThis sends immediately and cannot be undone.`)) return;
    setSending(true);
    setResult(null);
    const res = await sendOrientationEmail(attendee.id, templateKey, testMode ? testTo : null);
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "Send failed.");
      return;
    }
    if (testMode) {
      setResult(`Test sent to ${res.to}. Nothing was recorded against ${attendee.name}.`);
    } else {
      onSent(templateKey);
    }
  }

  return (
    <Modal open onClose={onClose} busy={sending}>
      <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
        {meta.label} · {attendee.name}
      </h2>
      {/* The title reads "2. Supervisors · Jane Doe", which on its own looks like
          it goes TO Jane. This banner renders immediately — before the Front fetch
          resolves — so the dialog never sits there with a Send button and no clue
          who is on the other end. */}
      <div
        className={clsx(
          "mt-2 rounded px-2.5 py-2 text-[12.5px] leading-snug",
          audienceChipClass(meta.audience)
        )}
      >
        <span className="font-bold uppercase tracking-wide">Goes to {AUDIENCE_LABEL[meta.audience]}</span>
        {meta.audience === "supervisor" ? (
          <span> — {attendee.name} does not receive this one.</span>
        ) : (
          <span> — {attendee.name} only. Nobody is cc&apos;d.</span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">{meta.purpose}</p>

      {sharedWith ? (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
          <span className="font-bold">{sharedWith.supervisor} also supervises {sharedWith.others.join(", ")}</span> on this
          session. Sending one at a time gives them a copy per person. Close this, tick everyone in the grid and use{" "}
          <b>2. Supervisors</b> in the bulk bar instead — that sends each supervisor a single email naming all of their
          new hires.
        </div>
      ) : null}

      {/* Test mode first: it changes who the email goes to, so it belongs above
          the preview it affects rather than buried under it. */}
      <div className="mt-3 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-2.5 dark:border-white/10 dark:bg-white/5">
        <label className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          Send as a test
        </label>
        {testMode ? (
          <div className="mt-2">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="test@skyshare.com"
              className="w-full rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
              Goes only here, ccs nobody, and does not tick the grid. The body is identical to the real email.
            </p>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Building the email from Front…</p>
      ) : error ? (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </div>
      ) : preview ? (
        <div className="mt-4 space-y-2">
          {preview.warnings.length > 0 ? (
            <ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          <dl className="space-y-1 text-[12.5px]">
            <Row label="To">
              <span className={clsx("font-medium", preview.toSource === "test" && "text-amber-700 dark:text-amber-300")}>
                {preview.to.join(", ")}
              </span>
              <span className="ml-1.5 text-brand-grey dark:text-slate-400">
                ({preview.toSource === "test" ? "test address" : preview.toSource === "supervisor" ? "supervisor" : `${preview.toSource} email`})
              </span>
            </Row>
            <Row label="Cc">{preview.cc.length ? preview.cc.join(", ") : <span className="text-brand-grey dark:text-slate-400">nobody</span>}</Row>
            <Row label="Subject">
              <span className="font-medium">{preview.subject}</span>
            </Row>
            <Row label="Template">
              <span className="text-brand-grey dark:text-slate-400">{preview.templateName} · fetched from Front just now</span>
            </Row>
          </dl>

          <div className="max-h-64 overflow-y-auto rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-[#0f2033]">
            {/* The real body, rendered as the recipient will see it. It comes from
                the team's own Front template, not from anything typed here. */}
            <div className="prose-sm text-[12.5px] text-brand-black dark:text-slate-200" dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      ) : null}

      {result ? <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{result}</p> : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={sending}>
          {result ? "Close" : "Cancel"}
        </Button>
        <Button onClick={doSend} disabled={sending || loading || !preview || Boolean(error)}>
          {sending ? "Sending…" : testMode ? "Send test" : "Send for real"}
        </Button>
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-brand-black dark:text-slate-200">{children}</dd>
    </div>
  );
}

// --- the one internal summary -----------------------------------------------
//
// The standing list used to be cc'd on every per-hire email, which on the first
// real run meant six watchers receiving six copies each. They now get this once.

function InternalSummary({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const [state, setState] = useState<OrientationSummaryResult | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    previewOrientationSummary(sessionId)
      .then(setState)
      .catch(() => setState(null));
  }, [sessionId]);

  // refreshKey, because the "has not been sent the invitation yet" warning below
  // is computed from sentTemplateKeys — ticking that box has to re-ask.
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function send() {
    const who = state?.to?.join(", ") ?? "the summary list";
    if (!confirm(`Send the session summary to ${who}?\n\nOne email, naming everyone attending. This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await sendOrientationSummary(sessionId);
    setBusy(false);
    setMsg(res.ok ? `Sent to ${res.to?.join(", ")}.` : (res.error ?? "Send failed."));
    load();
  }

  if (!state) return null;
  if (!state.ok) {
    return (
      <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">Internal summary unavailable: {state.error}</p>
    );
  }

  return (
    <div className="mt-3 rounded border border-brand-lea/15 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">Internal summary</h3>
        <Button onClick={send} disabled={busy}>
          {busy ? "Sending…" : state.alreadySent ? "Send again" : "Send the summary"}
        </Button>
      </div>
      <p className="mt-1 text-[11.5px] text-brand-grey dark:text-slate-400">
        One email to {state.to?.join(", ")} naming everyone attending. They are <b>no longer cc&apos;d</b> on the individual
        emails — that is what produced a copy per new hire.
      </p>

      {state.alreadySent ? (
        <p className="mt-1.5 text-[11.5px] text-brand-black dark:text-slate-200">
          Sent{" "}
          {new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" }).format(
            new Date(state.alreadySent.sentAt)
          )}{" "}
          MT, covering {state.alreadySent.attendeeCount} attendee
          {state.alreadySent.attendeeCount === 1 ? "" : "s"}.
          {state.stale ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              {" "}
              The attendee list has changed since — send it again if that matters.
            </span>
          ) : null}
        </p>
      ) : null}

      {state.warnings?.length ? (
        <ul className="mt-2 space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-[11.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
          {state.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
      >
        {open ? "Hide" : "Show"} what it says
      </button>
      {open && state.html ? (
        <div className="mt-2 max-h-64 overflow-y-auto rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-[#0f2033]">
          <p className="mb-2 text-[12px] font-semibold text-brand-lea dark:text-slate-100">{state.subject}</p>
          <div
            className="prose-sm text-[12.5px] text-brand-black dark:text-slate-200"
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-[11.5px] font-semibold text-brand-eden dark:text-slate-300">{msg}</p> : null}
    </div>
  );
}

// --- communication history --------------------------------------------------
//
// Everything the app has actually sent for this session, newest first. The data
// was always being recorded and never shown — the grid could only express it as a
// tick and a hover tooltip, which is not something you can hand to somebody asking
// "who was copied on Axel's invitation in October".
//
// Only APP sends appear. A hand-ticked box is somebody's recollection, not a
// record, and listing the two together would make the weaker one look like
// evidence.

function CommunicationHistory({ attendees }: { attendees: AttendeeRow[] }) {
  const [open, setOpen] = useState(false);

  const rows = attendees
    .flatMap((a) =>
      Object.entries(a.sends).map(([key, r]) => ({
        attendee: a.name,
        template: ORIENTATION_TEMPLATE_META.find((t) => t.key === key)?.label ?? key,
        ...r
      }))
    )
    .sort((x, y) => (x.sentAt < y.sentAt ? 1 : -1));

  if (rows.length === 0) {
    return (
      <p className="mt-3 text-[11px] text-brand-grey dark:text-slate-400">
        No orientation email has been sent from the app for this session yet.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
      >
        {open ? "Hide" : "Show"} communication history ({rows.length} sent)
      </button>

      {open ? (
        <div className="mt-2 overflow-x-auto rounded border border-brand-lea/15 dark:border-white/10">
          <table className="min-w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-brand-lea/10 text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/10 dark:text-slate-400">
                <th className="px-2 py-1.5">When</th>
                <th className="px-2 py-1.5">Who it&apos;s about</th>
                <th className="px-2 py-1.5">Email</th>
                <th className="px-2 py-1.5">To</th>
                <th className="px-2 py-1.5">Cc</th>
                <th className="px-2 py-1.5">Sent by</th>
                <th className="px-2 py-1.5">In Front</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-brand-lea/10 last:border-0 align-top dark:border-white/10">
                  <td className="whitespace-nowrap px-2 py-1.5 text-brand-black dark:text-slate-200">
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Denver",
                      dateStyle: "medium",
                      timeStyle: "short"
                    }).format(new Date(r.sentAt))}
                  </td>
                  <td className="px-2 py-1.5 font-medium text-brand-lea dark:text-slate-100">{r.attendee}</td>
                  <td className="px-2 py-1.5 text-brand-black dark:text-slate-200">
                    {r.template}
                    {r.subject ? (
                      <div className="text-[10px] text-brand-grey dark:text-slate-400">{r.subject}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-brand-black dark:text-slate-200">{r.to || "—"}</td>
                  <td className="px-2 py-1.5 text-brand-black dark:text-slate-200">
                    {/* An old record genuinely has no cc stored. Saying "not recorded"
                        rather than showing a blank stops it reading as "nobody". */}
                    {r.cc === undefined ? (
                      <span className="text-brand-grey dark:text-slate-500">not recorded</span>
                    ) : r.cc ? (
                      r.cc
                    ) : (
                      "nobody"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-brand-grey dark:text-slate-400">{r.sentBy ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    {r.conversationId ? (
                      <a
                        href={frontConversationUrl(r.conversationId)}
                        target="_blank"
                        rel="noreferrer"
                        title={`Conversation ${r.conversationId}`}
                        className="font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-brand-grey dark:text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// --- scheduling the reminder ------------------------------------------------
//
// Armed PER SESSION, never globally. This is the only thing in the app that emails
// a real new hire with nobody watching, so it is opted into one session at a time
// and the control states plainly what will happen and when.

type ReminderHealth = {
  ranToday: boolean;
  overdueToday: boolean;
  problems: string[];
  lastRun: {
    at: string;
    outcome: "sent" | "nothing-due" | "failed" | "crashed";
    sent: { name: string; to: string }[];
    failed: { name: string; error: string }[];
    error?: string;
  } | null;
};

type ReminderPreview = {
  wouldSend: number;
  wouldSkip: number;
  sessions: {
    sessionId: string;
    recipients: {
      attendeeId: string;
      name: string;
      action: "would-send" | "would-skip";
      reason?: string;
      to: string[];
      warnings: string[];
    }[];
  }[];
};

/**
 * Whether this session's reminder is armed, and when it would go.
 *
 * Owned by the panel rather than the scheduler: the grid's "3. Reminder" column
 * has to show the queued state too, and two components fetching it separately
 * would let them disagree the moment somebody toggles the checkbox.
 */
type ReminderStatusView = {
  armed: boolean;
  sendOnLabel: string;
  sendOnKey: string;
  dueToday: boolean;
  passed: boolean;
};

function ReminderScheduler({
  sessionId,
  status,
  onStatusChange,
  refreshKey
}: {
  sessionId: string;
  status: ReminderStatusView | null;
  onStatusChange: (next: ReminderStatusView) => void;
  refreshKey: number;
}) {
  const [health, setHealth] = useState<ReminderHealth | null>(null);
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Health is about the CRON, not this one session, so it loads regardless of
  // whether this session happens to be armed — a stopped cron is worth seeing
  // from wherever you are looking.
  //
  // refreshKey: its "N still unsent" count is derived from sentTemplateKeys, so a
  // hand-tick can clear the problem outright and this has to re-ask to notice.
  useEffect(() => {
    fetch("/api/orientation/reminder-health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHealth(d && Array.isArray(d.problems) ? d : null))
      .catch(() => setHealth(null));
  }, [sessionId, refreshKey]);

  async function loadPreview() {
    if (!status) return;
    setPreviewBusy(true);
    try {
      const res = await fetch(`/api/orientation/reminder-health?preview=${status.sendOnKey}`);
      const d = await res.json();
      setPreview(d?.preview ?? null);
    } catch {
      setPreview(null);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function toggle(next: boolean) {
    if (
      next &&
      !confirm(
        "Arm the automatic reminder?\n\nThe app will email every attendee who hasn't had the reminder, the day before orientation, with nobody reviewing it first. Anyone already sent it is skipped."
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orientation/sessions/${sessionId}/reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ armed: next })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.message ?? "Couldn't save.");
      // Straight back up to the panel, so the grid's Reminder column flips in
      // the same moment the checkbox does.
      onStatusChange(d);
      setMsg(next ? "Armed." : "Turned off — send it by hand instead.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  // A problem with the CRON is not session-scoped, so it must survive this
  // session's own status failing to load — otherwise the one thing worth seeing
  // disappears exactly when something is already wrong.
  const problemBox = health?.problems.length ? (
    <ul className="mt-2 space-y-1 rounded border border-red-300 bg-red-50 p-2.5 text-[11.5px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
      {health.problems.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  ) : null;

  if (!status) return problemBox;

  return (
    <div className="mt-3 rounded border border-brand-lea/15 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">Schedule the reminder</h3>
        <label className="flex items-center gap-2 text-[12px] font-semibold text-brand-lea dark:text-slate-100">
          <input type="checkbox" checked={status.armed} disabled={busy || status.passed} onChange={(e) => void toggle(e.target.checked)} />
          Send it automatically
        </label>
      </div>
      <p className="mt-1 text-[11.5px] text-brand-grey dark:text-slate-400">
        {status.passed ? (
          <>
            The send day ({status.sendOnLabel}) has already passed, so arming it would do nothing. Send &ldquo;3. Reminder&rdquo;
            by hand from the grid above.
          </>
        ) : status.armed ? (
          <>
            Goes out <span className="font-semibold text-brand-lea dark:text-slate-200">{status.sendOnLabel}</span> — the
            day before — to every attendee who hasn&apos;t had it. Anyone already sent it is skipped, so nobody gets it
            twice.
            {status.dueToday ? " That's today: it fires on the next scheduled run." : ""}
          </>
        ) : (
          <>
            Off. If you turn it on, it goes out <span className="font-semibold">{status.sendOnLabel}</span> — the day
            before orientation — with nobody reviewing it first. Always the calendar day before, including weekends and
            holidays, because the email says orientation is tomorrow.
          </>
        )}
      </p>

      {/* Whether the cron is actually alive. This is the only send in the app with
          nobody watching it, and its failure mode is silence — so "it didn't run"
          has to be as visible here as "it ran and failed". */}
      {problemBox}

      {health ? (
        <p className="mt-1.5 text-[11px] text-brand-grey dark:text-slate-400">
          {health.lastRun ? (
            <>
              Last automatic run{" "}
              <span className="font-semibold text-brand-lea dark:text-slate-200">
                {new Date(health.lastRun.at).toLocaleString("en-US", { timeZone: "America/Denver" })}
              </span>{" "}
              —{" "}
              {health.lastRun.outcome === "sent"
                ? `sent ${health.lastRun.sent.length}`
                : health.lastRun.outcome === "nothing-due"
                  ? "nothing was due"
                  : health.lastRun.outcome === "failed"
                    ? `${health.lastRun.failed.length} failed`
                    : `crashed (${health.lastRun.error ?? "no detail"})`}
              .
            </>
          ) : (
            <>No automatic run has ever been recorded.</>
          )}
        </p>
      ) : null}

      {/* A dry run, because the first unattended send is not the moment to find out
          who it resolves to. Builds the real emails and sends nothing. */}
      {status.armed && !status.passed ? (
        <div className="mt-2">
          <button
            onClick={() => (preview ? setPreview(null) : void loadPreview())}
            disabled={previewBusy}
            className="rounded border border-brand-lea/20 px-2 py-1 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-gold/10 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          >
            {previewBusy ? "Checking…" : preview ? "Hide what will go out" : "Show exactly what will go out"}
          </button>

          {preview ? (
            <div className="mt-2 rounded border border-brand-lea/15 p-2.5 dark:border-white/10">
              <p className="text-[11.5px] font-semibold text-brand-lea dark:text-slate-100">
                {preview.wouldSend} would be emailed
                {preview.wouldSkip ? `, ${preview.wouldSkip} skipped` : ""} on {status.sendOnLabel}. Nothing was sent
                just now.
              </p>
              <ul className="mt-1.5 space-y-1">
                {preview.sessions
                  .flatMap((s) => s.recipients)
                  .map((r) => (
                    <li key={r.attendeeId} className="text-[11px] text-brand-grey dark:text-slate-400">
                      <span className="font-semibold text-brand-lea dark:text-slate-200">{r.name}</span>{" "}
                      {r.action === "would-send" ? (
                        <>→ {r.to.join(", ") || "no address"}</>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">skipped — {r.reason}</span>
                      )}
                      {r.warnings.length ? (
                        <span className="text-amber-700 dark:text-amber-300"> · {r.warnings.join("; ")}</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {msg ? <p className="mt-1.5 text-[11px] font-semibold text-brand-eden dark:text-slate-300">{msg}</p> : null}
    </div>
  );
}

// --- cc editor --------------------------------------------------------------

function CcEditor() {
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [customized, setCustomized] = useState(false);
  // Loading, loaded, and FAILED TO LOAD are three different states and have to
  // stay three. They used to collapse into one boolean that a failed request set
  // to "loaded" — so a GET that never returned a list rendered as "Nobody is
  // cc'd", which is a claim about the data, not about the request. Since the save
  // below POSTS THE WHOLE REPLACEMENT LIST, adding one address on top of that
  // screen would have wiped everyone who was actually configured.
  const [load, setLoad] = useState<"idle" | "loading" | "ok" | "failed">("idle");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoad("loading");
    try {
      const res = await fetch("/api/orientation/email-cc");
      // A non-2xx that still parses as JSON is the trap here: without this check
      // an error body reads as "no addresses" rather than as a failure.
      if (!res.ok) throw new Error("cc list request failed");
      const d = (await res.json()) as { addresses?: string[]; customized?: boolean };
      setAddresses(d.addresses ?? []);
      setCustomized(Boolean(d.customized));
      setLoad("ok");
    } catch {
      setAddresses([]);
      setLoad("failed");
    }
  }, []);

  useEffect(() => {
    if (open && load === "idle") void loadList();
  }, [open, load, loadList]);

  async function save(next: string[]) {
    // A write must never be computed from a read that failed. What is on screen
    // after a failed load is an empty list for want of data, not the real one.
    if (load !== "ok") {
      setMsg("Not saved — the current cc list hasn't loaded, so saving would replace it with what you see here. Reload it first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/orientation/email-cc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: next })
      });
      const d = (await res.json()) as { addresses?: string[]; dropped?: string[]; message?: string };
      if (!res.ok) throw new Error(d.message ?? "Couldn't save.");
      setAddresses(d.addresses ?? []);
      setCustomized(true);
      // Say what was thrown away — silently dropping a typo is how someone stops
      // being cc'd without ever finding out.
      setMsg(d.dropped?.length ? `Saved. Ignored (not a valid address): ${d.dropped.join(", ")}` : "Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const e = draft.trim();
    if (!e) return;
    // Checked here as well as in save() so the typed address is kept rather than
    // cleared into a save that is about to be refused.
    if (load !== "ok") {
      setMsg("Not saved — the current cc list hasn't loaded, so we don't know who adding this would replace. Reload it first.");
      return;
    }
    setDraft("");
    void save([...addresses, e]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
      >
        Who gets the internal summary?
      </button>
    );
  }

  return (
    <div className="mt-3 rounded border border-brand-lea/15 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">Who gets the internal summary</h3>
        <button onClick={() => setOpen(false)} className="text-[11px] font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
          Hide
        </button>
      </div>
      <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
        These people get ONE summary email per session, not a copy of every individual email — being cc&apos;d on all of
        them is what produced a copy per new hire. Applies to all orientation sessions. The new hire&apos;s own supervisor
        is handled separately, from their profile.
        {customized ? "" : " (Currently the original list from the Front template.)"}
      </p>

      {load !== "ok" && load !== "failed" ? (
        <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">Loading…</p>
      ) : load === "failed" ? (
        // Say the list is unknown, and offer only the action that can make it
        // known again. No input, no Add button: there is nothing safe to save on
        // top of a list we could not read.
        <div className="mt-2 rounded border border-amber-300/60 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-semibold">Couldn&apos;t load the cc list.</p>
          <p className="mt-1">
            This is not the same as nobody being cc&apos;d — we don&apos;t know who is on it right now. Editing is off until
            it loads, because saving replaces the whole list and would drop anyone it couldn&apos;t read.
          </p>
          <button
            onClick={() => void loadList()}
            className="mt-2 rounded border border-amber-500/40 px-2 py-1 text-[11px] font-semibold transition hover:bg-amber-100 dark:hover:bg-amber-500/20"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {addresses.length === 0 ? (
              <span className="text-xs text-brand-grey dark:text-slate-400">Nobody is cc&apos;d.</span>
            ) : (
              addresses.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[11px] text-brand-lea dark:bg-white/5 dark:text-slate-200">
                  {a}
                  <button
                    onClick={() => void save(addresses.filter((x) => x !== a))}
                    disabled={busy}
                    aria-label={`Remove ${a}`}
                    className="text-red-600 transition hover:text-red-700 dark:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="name@skyshare.com"
              className="flex-1 rounded border border-brand-lea/15 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              onClick={add}
              disabled={busy || !draft.trim()}
              className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            >
              Add
            </button>
          </div>
          {msg ? <p className="mt-2 text-[11px] font-semibold text-brand-eden dark:text-slate-300">{msg}</p> : null}
        </>
      )}
    </div>
  );
}
