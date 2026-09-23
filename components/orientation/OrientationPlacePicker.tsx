"use client";

import { useMemo, useState } from "react";
import {
  ORIENTATION_PLACES,
  mapsSearchUrl,
  normalizePlaceText,
  resolveSessionPlace,
  type UsedPlace
} from "@/lib/orientation/places";

// Where an orientation is held: a picklist, with a way to type a new place.
//
// WHY A PICKLIST. Her words on Sep 11: orientation runs at multiple SkyShare
// locations and moves to whatever space is free, so location is a real
// picklist and not a fixed address. Before this, the session page had no way to
// set the place at all — the address column existed and nothing could write it,
// so the email's location override could not fire on the sessions that mattered.
//
// THE USUAL PLACE IS THE DEFAULT, so a normal session needs nothing typed.
// Somewhere else is the three places he gave us (HQ, Atlantic Aviation FBO,
// Ogden), then every place an earlier session was saved with, then "Somewhere
// else…" for a new one. A new one typed here is remembered by being saved on
// the session — the next picker lists it (lib/orientation/places-used.ts).

export type PlaceValue = { location: string; address: string };

type Choice = { key: string; text: string; value: PlaceValue };

function choicesFor(used: UsedPlace[]): Choice[] {
  const known: Choice[] = ORIENTATION_PLACES.map((p) => ({
    key: `known:${p.key}`,
    text: `${p.label}${p.usual ? " (the usual)" : ""} — ${p.address}`,
    value: { location: p.name, address: p.address }
  }));
  const extra: Choice[] = used.map((u, i) => ({
    key: `used:${i}`,
    text: `${u.location} — ${u.address}`,
    value: { location: u.location, address: u.address }
  }));
  return [...known, ...extra];
}

/** Which row a value is, or "other" for a place typed by hand. Matched on the
    ADDRESS for the known places (their name may have been typed differently on
    old rows), and on both for an earlier session's place. */
function choiceKeyFor(value: PlaceValue, choices: Choice[]): string {
  const address = normalizePlaceText(value.address);
  if (!address) return "other";
  const hit = choices.find(
    (c) =>
      normalizePlaceText(c.value.address) === address &&
      (c.key.startsWith("known:") || normalizePlaceText(c.value.location) === normalizePlaceText(value.location))
  );
  return hit?.key ?? "other";
}

/**
 * Where the picker starts for an existing session.
 *
 * A session with no address starts on the place its NAME matches — HQ for every
 * session created before this picker, which is what the invite and the summary
 * have always assumed. So opening the editor and saving it unchanged writes that
 * assumption down explicitly and changes nothing anybody receives.
 */
export function initialPlaceValue(session: { location: string | null; address: string | null }): PlaceValue {
  const place = resolveSessionPlace(session);
  if (place.address) {
    return { location: session.location?.trim() || place.known?.name || place.address, address: place.address };
  }
  return { location: session.location?.trim() ?? "", address: "" };
}

/** Why a typed place cannot be saved yet, in words; null when it can. */
export function placeValueProblem(value: PlaceValue): string | null {
  if (!value.location.trim()) return "Give the place a name — the supervisors' email puts it in the subject line.";
  if (!value.address.trim()) {
    return "Add the street address — it goes on every email's Location line and into the calendar invite.";
  }
  return null;
}

const LABEL = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400";
const FIELD =
  "mt-1 block w-full min-w-0 rounded border border-brand-lea/20 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100 dark:placeholder:text-slate-500";

export function OrientationPlacePicker({
  value,
  onChange,
  usedPlaces,
  disabled
}: {
  value: PlaceValue;
  onChange: (next: PlaceValue) => void;
  usedPlaces: UsedPlace[];
  disabled?: boolean;
}) {
  const choices = useMemo(() => choicesFor(usedPlaces), [usedPlaces]);
  // Kept as STATE rather than derived: once somebody picks "Somewhere else…" the
  // two boxes must stay open while they type, even if what they type happens to
  // match a listed address letter for letter.
  const [typing, setTyping] = useState(() => choiceKeyFor(value, choices) === "other");
  const selected = typing ? "other" : choiceKeyFor(value, choices);

  return (
    <div className="min-w-0">
      <label className="block">
        <span className={LABEL}>Where</span>
        <select
          value={selected}
          disabled={disabled}
          onChange={(e) => {
            const key = e.target.value;
            if (key === "other") {
              setTyping(true);
              // Starts empty on purpose: "somewhere else" is a new place, and
              // editing HQ's address into another building's is how a typo ends
              // up as a new hire's destination.
              onChange({ location: "", address: "" });
              return;
            }
            const choice = choices.find((c) => c.key === key);
            if (choice) {
              setTyping(false);
              onChange(choice.value);
            }
          }}
          className={FIELD}
        >
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.text}
            </option>
          ))}
          <option value="other">Somewhere else…</option>
        </select>
      </label>

      {selected === "other" ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className={LABEL}>Place name</span>
            <input
              value={value.location}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, location: e.target.value })}
              placeholder="e.g. SVR hangar office"
              className={FIELD}
            />
          </label>
          <label className="block min-w-0">
            <span className={LABEL}>Street address</span>
            <input
              value={value.address}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, address: e.target.value })}
              placeholder="Street, City, UT 84000"
              className={FIELD}
            />
          </label>
          <p className="text-[11px] text-brand-grey dark:text-slate-400 sm:col-span-2">
            Both go into the emails and the calendar invite. Once a session is saved here, this place is in the list next
            time.
          </p>
        </div>
      ) : null}

      {value.address.trim() ? (
        <a
          href={mapsSearchUrl(value.address.trim())}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
        >
          Check it on a map
        </a>
      ) : null}
    </div>
  );
}
