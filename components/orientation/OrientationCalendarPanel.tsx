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
type SupervisorGuest = { name: string; email: string; forWhom: string[] };
type PersonHit = { id: string; name: string; position: string | null; department: string | null; email: string | null };

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
  supervisors: SupervisorGuest[];
  existing:
    | {
        eventId: string;
        htmlLink: string | null;
        hangoutLink: string | null;
        createdAt: string;
        liveAttendees: string[];
        missingInGoogle: boolean;
        /** true = matches the session, false = stale, null = no baseline recorded. */
        inStep: boolean | null;
        drifted: string[];
        syncedAt?: string;
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

export function OrientationCalendarPanel({
  sessionId,
  /** Bumped by the page when a calendar-relevant field is saved (a reschedule),
      so this panel re-reads instead of sitting on a preview from before the
      change. Without it the panel keeps saying the invite is in step while the
      session underneath it has moved. */
  refreshKey = 0
}: {
  sessionId: string;
  refreshKey?: number;
}) {
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
  }, [load, refreshKey]);

  async function act(
    action: "create" | "update" | "add-attendees" | "add-guests",
    emails?: string[],
    notify?: boolean
  ) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/orientation/sessions/${sessionId}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(emails ? { emails } : {}), ...(notify === undefined ? {} : { notify }) })
      });
      const data = (await res.json()) as {
        message?: string;
        added?: string[];
        alreadyThere?: string[];
        skipped?: string[];
        rejected?: string[];
        notified?: boolean;
      };
      if (!res.ok) throw new Error(data.message ?? "That didn't work.");

      if (action === "create") {
        setResult("Calendar invite created. Nobody has been invited yet.");
      } else if (action === "update") {
        setResult(
          data.notified
            ? "Invite updated and the guests have been emailed about the change."
            : "Invite updated — title, description, location and times now match the session. The guests were NOT emailed."
        );
      } else {
        const bits = [`Invited ${data.added?.length ?? 0}.`];
        if (data.alreadyThere?.length) bits.push(`${data.alreadyThere.length} were already on it.`);
        if (data.skipped?.length) bits.push(`Skipped (no email): ${data.skipped.join(", ")}.`);
        if (data.rejected?.length) bits.push(`Not valid addresses: ${data.rejected.join(", ")}.`);
        setResult(bits.join(" "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      // Reload on FAILURE too. A rate-limited add leaves the panel showing a guest
      // count from before the attempt, which reads as "it half worked" when the
      // truth is usually that nothing changed. Re-reading makes the number honest
      // either way.
      await load();
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

          {/* Keeping the event in step with the session.
              WHY THIS IS A BUTTON AND NOT AUTOMATIC ON SAVE. Both automatic
              options are worse than an explicit one:
                - push silently WITH notify and every typo fix in the address
                  emails a "this event has changed" to every guest. On a session
                  with seven new hires and their supervisors that is spam, and it
                  trains people to ignore the one that matters.
                - push silently WITHOUT notify and the invite is quietly correct
                  while everyone who already accepted keeps the old time in their
                  own calendar and is never told. That is the failure the standing
                  propagation rule exists to prevent, dressed up as a fix.
              So the app detects the drift, says exactly what moved, and makes the
              person who moved it choose whether the guests hear about it. */}
          {existing && !existing.missingInGoogle && !preview.blocker ? (
            <CalendarSyncBox existing={existing} busy={busy} onUpdate={(notify) => void act("update", undefined, notify)} />
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

          {existing && !preview.blocker ? (
            <GuestPicker
              supervisors={preview.supervisors}
              alreadyOn={alreadyOn}
              busy={busy}
              onAdd={(emails, names) => {
                if (
                  !confirm(
                    `Add ${emails.length} guest${emails.length === 1 ? "" : "s"} to the calendar invite?\n\n${names.join(", ")}\n\nGoogle emails them immediately. This cannot be undone.`
                  )
                ) {
                  return;
                }
                void act("add-guests", emails);
              }}
            />
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

// --- keeping the event in step ----------------------------------------------
//
// updateOrientationCalendarEvent has existed since the reschedule work but had no
// caller: the panel's action type was "create" | "add-attendees" | "add-guests"
// and the reschedule PATCH wrote the session row and returned. So moving an
// orientation left every guest holding an invite for the old time, silently.
//
// THREE STATES, and the third is not a rounding error. "In step" and "out of
// step" are both claims that need a baseline to be true, and events created
// before the fingerprint shipped have none — Google's events.get returns the
// summary but not the start, end or location, so there is nothing else to
// compare against. Those show as unknown and still offer the button, because
// pushing a correct event again is harmless and asserting it is fine when nobody
// knows is not.

function CalendarSyncBox({
  existing,
  busy,
  onUpdate
}: {
  existing: NonNullable<Preview["existing"]>;
  busy: boolean;
  onUpdate: (notify: boolean) => void;
}) {
  const [notify, setNotify] = useState(false);
  const guests = existing.liveAttendees.length;

  if (existing.inStep === true) {
    return (
      <p className="mt-3 text-[11.5px] text-brand-grey dark:text-slate-400">
        The invite matches this session
        {existing.syncedAt
          ? ` — last pushed ${new Intl.DateTimeFormat("en-US", {
              timeZone: "America/Denver",
              dateStyle: "medium",
              timeStyle: "short"
            }).format(new Date(existing.syncedAt))} MT.`
          : "."}
      </p>
    );
  }

  const stale = existing.inStep === false;

  return (
    <div
      className={
        stale
          ? "mt-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15"
          : "mt-3 rounded border border-brand-lea/15 p-3 dark:border-white/10"
      }
    >
      <h3
        className={
          stale
            ? "text-sm font-semibold text-amber-900 dark:text-amber-200"
            : "text-sm font-semibold text-brand-lea dark:text-slate-100"
        }
      >
        {stale ? "The invite is out of date" : "Keep the invite in step"}
      </h3>
      <p
        className={
          stale
            ? "mt-1 text-[12px] text-amber-900 dark:text-amber-200"
            : "mt-1 text-[11.5px] text-brand-grey dark:text-slate-400"
        }
      >
        {stale ? (
          <>
            This session&apos;s <b>{existing.drifted.join(", ")}</b> changed after the invite was last pushed, so the
            event in Google still shows the old details. Updating rewrites its title, description, location and times
            from the session.
          </>
        ) : (
          <>
            This event was created before the app started recording what it pushed, so it can&apos;t say whether it
            matches the session &mdash; Google doesn&apos;t report an event&apos;s time or address back. Updating pushes
            the session&apos;s current title, description, location and times, which is harmless if it was already right.
          </>
        )}
      </p>

      <label className="mt-2 flex items-start gap-2 text-[12px] font-semibold text-brand-lea dark:text-slate-100">
        <input type="checkbox" checked={notify} disabled={busy} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5" />
        <span>
          Email the {guests} guest{guests === 1 ? "" : "s"} about the change
          <span className="block font-normal text-brand-grey dark:text-slate-400">
            Leave this off for a typo or a wording fix. Turn it on when the time or the place really moved &mdash;
            otherwise anyone who already accepted keeps the old details in their own calendar and is never told.
          </span>
        </span>
      </label>

      <Button
        className="mt-2"
        onClick={() => {
          if (
            notify &&
            !confirm(
              `Update the invite and email ${guests} guest${guests === 1 ? "" : "s"}?\n\nGoogle sends the change notice immediately and it cannot be undone.`
            )
          ) {
            return;
          }
          onUpdate(notify);
        }}
        disabled={busy}
      >
        {busy ? "Updating…" : notify ? `Update the invite and tell ${guests}` : "Update the invite (nobody emailed)"}
      </Button>
    </div>
  );
}

// --- guest picker -----------------------------------------------------------
//
// Supervisors get their own one-click row because they are the common case and the
// app already knows who they are (linked on each hire). Everyone else comes from a
// search over the SAME employee list the supervisor picker uses, so "who counts as
// an employee" has one answer — active, not terminated, tenured people included.
// Free-typed addresses are allowed too: not everyone who belongs at orientation is
// on the roster, and refusing them would just push the work back into Google.

function GuestPicker({
  supervisors,
  alreadyOn,
  busy,
  onAdd
}: {
  supervisors: SupervisorGuest[];
  alreadyOn: Set<string>;
  busy: boolean;
  onAdd: (emails: string[], names: string[]) => void;
}) {
  const [picked, setPicked] = useState<{ email: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [searching, setSearching] = useState(false);

  const isPicked = (email: string) => picked.some((p) => p.email.toLowerCase() === email.toLowerCase());
  const onInvite = (email: string) => alreadyOn.has(email.toLowerCase());

  function toggle(email: string, name: string) {
    setPicked((cur) =>
      cur.some((p) => p.email.toLowerCase() === email.toLowerCase())
        ? cur.filter((p) => p.email.toLowerCase() !== email.toLowerCase())
        : [...cur, { email, name }]
    );
  }

  // Debounced so typing a name isn't one request per keystroke.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/new-hires/supervisor-search?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((d: { people?: PersonHit[] }) => !cancelled && setHits(d.people ?? []))
        .catch(() => !cancelled && setHits([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const freeText = q.trim();
  const canAddTyped = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(freeText) && !isPicked(freeText) && !onInvite(freeText);

  const supervisorsToOffer = supervisors.filter((s) => !onInvite(s.email));

  return (
    <div className="mt-3 rounded border border-brand-lea/15 p-3 dark:border-white/10">
      <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">Add other guests</h3>
      <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
        Supervisors, presenters, anyone else who should be in the room. Adding emails them straight away.
      </p>

      {supervisorsToOffer.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
            The attendees&apos; supervisors
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {supervisorsToOffer.map((s) => (
              <button
                key={s.email}
                onClick={() => toggle(s.email, s.name)}
                title={`Supervises ${s.forWhom.join(", ")}`}
                className={
                  isPicked(s.email)
                    ? "rounded border border-brand-lea bg-brand-lea px-2 py-1 text-[11px] font-semibold text-white"
                    : "rounded border border-brand-lea/20 px-2 py-1 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
                }
              >
                {isPicked(s.email) ? "✓ " : "+ "}
                {s.name}
                <span className="ml-1 font-normal opacity-70">({s.forWhom.length})</span>
              </button>
            ))}
            <button
              onClick={() => setPicked((cur) => [
                ...cur,
                ...supervisorsToOffer
                  .filter((s) => !cur.some((p) => p.email.toLowerCase() === s.email.toLowerCase()))
                  .map((s) => ({ email: s.email, name: s.name }))
              ])}
              className="rounded px-2 py-1 text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
            >
              Select all {supervisorsToOffer.length}
            </button>
          </div>
        </div>
      ) : supervisors.length > 0 ? (
        <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
          Every attendee&apos;s supervisor is already on the invite.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          None of the attendees have a supervisor on file, so there are none to suggest.
        </p>
      )}

      <div className="mt-3">
        <div className="text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
          Anyone else
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search employees by name, or type an email address"
          className="mt-1 w-full rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {searching ? <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">Searching…</p> : null}

        {hits.length > 0 ? (
          <ul className="mt-1 max-h-44 overflow-y-auto rounded border border-brand-lea/15 dark:border-white/10">
            {hits.map((p) => {
              const disabled = !p.email || onInvite(p.email);
              return (
                <li key={p.id}>
                  <button
                    disabled={disabled}
                    onClick={() => p.email && toggle(p.email, p.name)}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[12px] text-brand-black transition hover:bg-brand-cloudDancer/60 disabled:opacity-45 dark:text-slate-200 dark:hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {isPicked(p.email ?? "") ? "✓ " : ""}
                      {p.name}
                      {p.position ? <span className="text-brand-grey dark:text-slate-400"> · {p.position}</span> : null}
                    </span>
                    <span className="shrink-0 text-[10px] text-brand-grey dark:text-slate-400">
                      {!p.email ? "no email" : onInvite(p.email) ? "already invited" : p.email}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {canAddTyped ? (
          <button
            onClick={() => {
              toggle(freeText, freeText);
              setQ("");
            }}
            className="mt-1 text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
          >
            Add {freeText} as a guest
          </button>
        ) : null}
      </div>

      {picked.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <span
                key={p.email}
                className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[11px] text-brand-lea dark:bg-white/5 dark:text-slate-200"
              >
                {p.name}
                <button
                  onClick={() => toggle(p.email, p.name)}
                  aria-label={`Remove ${p.name}`}
                  className="text-red-600 transition hover:text-red-700 dark:text-red-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <Button
            className="mt-2"
            onClick={() => onAdd(picked.map((p) => p.email), picked.map((p) => p.name))}
            disabled={busy}
          >
            {busy ? "Adding…" : `Add ${picked.length} guest${picked.length === 1 ? "" : "s"} to the invite`}
          </Button>
        </>
      ) : null}
    </div>
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
