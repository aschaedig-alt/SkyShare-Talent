"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { mountainWallClockToIso, toMountainDateTimeParts } from "@/lib/calendar/format";
import { describeOffNormal, USUAL_HOURS, type UsedPlace } from "@/lib/orientation/places";
import { OffNormalNotice } from "./OffNormalNotice";
import { OrientationPlacePicker, initialPlaceValue, placeValueProblem, type PlaceValue } from "./OrientationPlacePicker";

// Change a session's date, hours and place in one form.
//
// WHY THIS REPLACED THE RESCHEDULE PANEL. Her feedback (Aug 31, cmthlyx3z):
// "every once in a while the time is different, so we need to be able to change
// ... the time or location when needed." The Reschedule panel could move the date
// and the hours but not the place — nothing on the page could set the address,
// so the email's location override had nothing to work from. Time and place now
// live together because they travel together: both are stated in the same
// emails, the same invite title and the same invite description.
//
// THE END TIME IS REQUIRED, AND OFFERED. A session with no end time used to get
// neither a rewrite nor a warning in the emails (the Aug 31 finding), and three
// of the six sessions on record have none. So when there is none, the box is
// pre-filled with the usual 3:00 PM and says so, rather than left blank for the
// save to quietly store another null.
//
// WHAT SAVING DOES NOT DO: it does not touch Google and does not email anybody.
// The page then says what is out of step — the invite, and anyone already
// emailed the old details — and the calendar panel below is where the invite is
// updated, with emailing its guests as a separate, explicit choice.

const LABEL = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400";
const FIELD =
  "mt-1 block w-full min-w-0 rounded border border-brand-lea/20 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

export type TimePlaceSaved = {
  /** Which invite-relevant fields actually moved, as the PATCH measured them. */
  calendarFieldsChanged: string[];
};

export function SessionTimePlaceEditor({
  session,
  usedPlaces,
  onCancel,
  onSaved
}: {
  session: { id: string; date: string; endsAt: string | null; location: string | null; address: string | null };
  usedPlaces: UsedPlace[];
  onCancel: () => void;
  onSaved: (result: TimePlaceSaved) => void;
}) {
  const startParts = toMountainDateTimeParts(session.date);
  const [day, setDay] = useState(startParts.date);
  const [startTime, setStartTime] = useState(startParts.time);
  const endWasMissing = !session.endsAt;
  const [endTime, setEndTime] = useState(session.endsAt ? toMountainDateTimeParts(session.endsAt).time : USUAL_HOURS.end);
  const [place, setPlace] = useState<PlaceValue>(() => initialPlaceValue(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mountain wall clock, the same conversion the old Reschedule panel used, so
  // a 9:30 typed here is 9:30 Mountain whatever zone the browser is in.
  const startIso = day && startTime ? mountainWallClockToIso(day, startTime) : null;
  const endIso = day && endTime ? mountainWallClockToIso(day, endTime) : null;

  const problem = !startIso
    ? "Pick a date and a start time."
    : !endIso
      ? "Set an end time. The emails and the invite both state the hours, and without an end they cannot be checked."
      : new Date(endIso).getTime() <= new Date(startIso).getTime()
        ? "The end time has to be after the start time."
        : placeValueProblem(place);

  // Live, so the flag is seen while the time is being typed rather than after
  // the emails have gone. Same sentences as everywhere else (places.ts).
  const offNormal =
    startIso && endIso
      ? describeOffNormal({ date: startIso, endsAt: endIso, location: place.location, address: place.address })
      : [];
  const usualHours = startTime === USUAL_HOURS.start && endTime === USUAL_HOURS.end;

  async function save() {
    if (problem || !startIso || !endIso) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orientation/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Both place columns every time, even when only the hours changed: a
        // session with no address has always MEANT the usual place, and saving
        // writes that down. The PATCH compares the RESOLVED place, so this is
        // not reported as a move and does not mark the invite stale.
        body: JSON.stringify({
          date: startIso,
          endsAt: endIso,
          location: place.location.trim(),
          address: place.address.trim()
        })
      });
      const data = (await res.json().catch(() => null)) as { calendarFieldsChanged?: string[]; message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Couldn't save the time and place.");
      onSaved({ calendarFieldsChanged: data?.calendarFieldsChanged ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the time and place.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
      {/* A grid of min-w-0 cells rather than a flex row, for the reason the
          new-session modal gives: Chrome's native time inputs have a large
          intrinsic width and a flex child will not shrink below it. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block min-w-0">
          <span className={LABEL}>Date</span>
          <input type="date" value={day} disabled={saving} onChange={(e) => setDay(e.target.value)} className={FIELD} />
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>Start (MT)</span>
          <input
            type="time"
            value={startTime}
            disabled={saving}
            onChange={(e) => setStartTime(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="block min-w-0">
          <span className={LABEL}>End (MT)</span>
          <input type="time" value={endTime} disabled={saving} onChange={(e) => setEndTime(e.target.value)} className={FIELD} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        {!usualHours ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setStartTime(USUAL_HOURS.start);
              setEndTime(USUAL_HOURS.end);
            }}
            className="font-semibold text-brand-eden underline-offset-2 hover:underline disabled:opacity-50 dark:text-slate-300"
          >
            Use the usual hours ({USUAL_HOURS.startLabel} – {USUAL_HOURS.endLabel})
          </button>
        ) : null}
        {endWasMissing ? (
          <span className="text-amber-800 dark:text-amber-200">
            No end time was recorded for this session, so {USUAL_HOURS.endLabel} — the usual — is filled in. Change it if
            this one ends differently.
          </span>
        ) : null}
      </div>

      <OrientationPlacePicker value={place} onChange={setPlace} usedPlaces={usedPlaces} disabled={saving} />

      <OffNormalNotice
        lines={offNormal}
        note={
          <>
            That is allowed. Each email rewrites its stated hours and <b>Location:</b> line to match and lists the changes
            in its send window; for an armed automatic reminder, check &ldquo;Show exactly what will go out&rdquo;. The
            calendar invite is rebuilt from this when you update it below.
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void save()} disabled={saving || Boolean(problem)}>
          {saving ? "Saving…" : "Save time and place"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
        >
          Cancel
        </button>
        {error ? (
          <span className="text-xs font-semibold text-red-700 dark:text-red-300">{error}</span>
        ) : problem ? (
          <span className="text-xs text-amber-800 dark:text-amber-200">{problem}</span>
        ) : (
          <span className="text-xs text-brand-grey dark:text-slate-400">
            Attendees keep their spots. Nothing is emailed and the Google invite is not touched by saving.
          </span>
        )}
      </div>
    </div>
  );
}
