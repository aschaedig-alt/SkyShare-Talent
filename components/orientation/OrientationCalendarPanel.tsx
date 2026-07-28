"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";

// Creating the orientation calendar invite, and inviting the attendees to it.
//
// Same two rules as the email panel, for the same reason — adding guests emails
// real new hires and cannot be taken back:
//  1. You see the exact event (title, time, address, warnings) BEFORE creating it.
//  2. Creating the event and inviting people are SEPARATE buttons. Creating is
//     silent; only the second one sends anything.
//
// When Google isn't wired up the buttons are disabled and the panel SAYS WHY,
// rather than presenting a control that fails on click.

type AttendeeEmail = { name: string; email: string | null; source: "company" | "personal" | "none" };

type Preview = {
  draft: {
    summary: string;
    description: string;
    location: string;
    startTime: string;
    endTime: string;
    timeZone: string;
    warnings: string[];
  };
  attendees: AttendeeEmail[];
  existing:
    | {
        eventId: string;
        htmlLink: string | null;
        hangoutLink: string | null;
        createdAt: string;
        liveAttendees: string[];
        missingInGoogle: boolean;
      }
    | null;
  blocker: string | null;
};

function fmtRange(startIso: string, endIso: string, timeZone: string): string {
  const t = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(startIso));
  return `${day}, ${t(startIso)} – ${t(endIso)} MT`;
}

export function OrientationCalendarPanel({ sessionId }: { sessionId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [showBody, setShowBody] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orientation/sessions/${sessionId}/calendar`);
      const data = (await res.json()) as Preview & { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Couldn't load the calendar preview.");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the calendar preview.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "create" | "add-attendees") {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/orientation/sessions/${sessionId}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = (await res.json()) as {
        message?: string;
        added?: string[];
        alreadyThere?: string[];
        skipped?: string[];
      };
      if (!res.ok) throw new Error(data.message ?? "That didn't work.");

      if (action === "create") {
        setResult("Calendar invite created. Nobody has been invited yet.");
      } else {
        const bits = [`Invited ${data.added?.length ?? 0}.`];
        if (data.alreadyThere?.length) bits.push(`${data.alreadyThere.length} were already on it.`);
        if (data.skipped?.length) bits.push(`Skipped (no email): ${data.skipped.join(", ")}.`);
        setResult(bits.join(" "));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  function confirmInvite() {
    const withEmail = preview?.attendees.filter((a) => a.email) ?? [];
    const already = new Set((preview?.existing?.liveAttendees ?? []).map((e) => e.toLowerCase()));
    const fresh = withEmail.filter((a) => !already.has((a.email ?? "").toLowerCase()));
    if (fresh.length === 0) {
      setResult("Everyone with an email address is already on the invite.");
      return;
    }
    const names = fresh.map((a) => a.name).join(", ");
    if (!confirm(`Invite ${fresh.length} attendee${fresh.length === 1 ? "" : "s"} to the calendar event?\n\n${names}\n\nGoogle emails them immediately. This cannot be undone.`)) {
      return;
    }
    void act("add-attendees");
  }

  const existing = preview?.existing ?? null;
  const invitable = preview?.attendees.filter((a) => a.email) ?? [];
  const alreadyOn = new Set((existing?.liveAttendees ?? []).map((e) => e.toLowerCase()));
  const notYetInvited = invitable.filter((a) => !alreadyOn.has((a.email ?? "").toLowerCase()));

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Google Calendar invite</h2>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        Builds the invite from this session — title, date, address, Meet link and the Orientation colour — then lets you
        add the attendees as guests. Creating is silent; inviting is what emails them.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">Loading…</p>
      ) : preview ? (
        <>
          {preview.blocker ? (
            <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              <span className="font-bold">Can&apos;t reach Google Calendar yet.</span> {preview.blocker}
            </div>
          ) : null}

          {preview.draft.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              {preview.draft.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          <dl className="mt-3 space-y-1 text-[12.5px]">
            <Row label="Title">
              <span className="font-medium">{preview.draft.summary}</span>
            </Row>
            <Row label="When">{fmtRange(preview.draft.startTime, preview.draft.endTime, preview.draft.timeZone)}</Row>
            <Row label="Where">{preview.draft.location}</Row>
            <Row label="Guests">
              {existing ? (
                <>
                  {existing.liveAttendees.length} on the invite
                  {notYetInvited.length > 0 ? (
                    <span className="text-amber-700 dark:text-amber-300"> · {notYetInvited.length} not invited yet</span>
                  ) : null}
                </>
              ) : (
                <>none yet · {invitable.length} of {preview.attendees.length} attendees have an email</>
              )}
            </Row>
          </dl>

          <button
            onClick={() => setShowBody((v) => !v)}
            className="mt-2 text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
          >
            {showBody ? "Hide" : "Show"} the description the guests will read
          </button>
          {showBody ? (
            <div className="mt-2 max-h-64 overflow-y-auto rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-[#0f2033]">
              <div
                className="prose-sm text-[12.5px] text-brand-black dark:text-slate-200"
                dangerouslySetInnerHTML={{ __html: preview.draft.description }}
              />
            </div>
          ) : null}

          {existing ? (
            <div className="mt-3 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-2.5 text-[12px] dark:border-white/10 dark:bg-white/5">
              {existing.missingInGoogle ? (
                <p className="font-semibold text-red-700 dark:text-red-300">
                  This session is linked to an event that no longer exists in Google — it was deleted there.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {existing.htmlLink ? (
                    <a
                      href={existing.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100"
                    >
                      Open in Google Calendar
                    </a>
                  ) : null}
                  {existing.hangoutLink ? (
                    <a
                      href={existing.hangoutLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
                    >
                      {existing.hangoutLink.replace("https://", "")}
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded border border-red-300 bg-red-50 p-2.5 text-[12.5px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
              {error}
            </div>
          ) : null}
          {result ? (
            <p className="mt-3 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300">{result}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void act("create")} disabled={busy || Boolean(existing) || Boolean(preview.blocker)}>
              {busy ? "Working…" : existing ? "Invite created" : "Create calendar invite"}
            </Button>
            <Button
              variant="secondary"
              onClick={confirmInvite}
              disabled={busy || !existing || Boolean(preview.blocker) || notYetInvited.length === 0}
            >
              {notYetInvited.length > 0
                ? `Add ${notYetInvited.length} attendee${notYetInvited.length === 1 ? "" : "s"} to the invite`
                : "Attendees added"}
            </Button>
          </div>
        </>
      ) : error ? (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2.5 text-[12.5px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words text-brand-black dark:text-slate-200">{children}</dd>
    </div>
  );
}
