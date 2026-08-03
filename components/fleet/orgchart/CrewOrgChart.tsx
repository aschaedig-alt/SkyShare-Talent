"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { CrewGroup, Departure, Seat } from "@/lib/fleet/staffing/types";
import { normSeat, cntSeat } from "@/lib/fleet/staffing/compute";
import { CREW_GROUPS, CREW_LEADERSHIP, CREW_TRAINING, CREW_PILOT_TURNOVER, turnoverFor } from "@/lib/fleet/staffing/crew-data";
import { aircraftLabel, positionLabel, isoToday, splitDepartures, isDepartureArchived, DEPARTURE_ARCHIVE_DAYS } from "@/lib/fleet/staffing/labels";
import type { TrainingRecord } from "@/lib/fleet/staffing/training";
import { completedTraining, matchKey, trainingRows } from "@/lib/fleet/staffing/training";
import { SeatSquares, PersonRow, SlotRow } from "./SeatParts";
import { LinkPicker, orgLinkBtnStyle } from "./LinkPicker";
import { PeopleIndex, type IndexEntry } from "./PeopleIndex";
import { TrainingTab } from "./TrainingTab";
import { useUnsavedGuard } from "./useUnsavedGuard";
import styles from "./OrgChart.module.css";

type SortKey = "Fleet size" | "Open seats";
type ParkedKey = "hide" | "show";
type TabKey = "chart" | "training";

// --- edit-mode roster mutation (pure, operate on a cloned draft) ------------
type SeatKey = "pic" | "sic" | "cabin";
type FillBucket = "line" | "train" | "cand" | "candInt" | "offered";
type MovePick = { gIdx: number; seatKey: SeatKey; bucket: FillBucket; name: string };

const SEAT_LABEL: Record<SeatKey, string> = { pic: "Captain", sic: "First Officer", cabin: "Cabin" };

function ensureSeat(g: CrewGroup, key: SeatKey): Seat {
  let s = g[key];
  if (!s) {
    s = {};
    g[key] = s;
  }
  return s;
}

function pull(seat: Seat, bucket: FillBucket, name: string) {
  const arr = seat[bucket];
  if (!Array.isArray(arr)) return;
  const i = arr.indexOf(name);
  if (i >= 0) arr.splice(i, 1);
  if (arr.length === 0) delete seat[bucket];
}

function push(seat: Seat, bucket: FillBucket, name: string) {
  const arr = seat[bucket] ?? (seat[bucket] = []);
  if (!arr.includes(name)) arr.push(name);
}

/** After a removal, collapse an empty FO/Cabin seat back to "no seat" so the
    card shows the correct empty state; PIC stays as a 0-count seat. */
function tidySeat(g: CrewGroup, key: SeatKey) {
  const s = g[key];
  if (s && Object.keys(s).length === 0) {
    if (key === "sic") g.sic = null;
    else if (key === "cabin") delete g.cabin;
  }
}

function ColBody({
  seat,
  leadName,
  showParked,
  tags,
  links = {},
  highlight,
  trainingEnd
}: {
  seat?: Seat | null;
  leadName?: string;
  showParked: boolean;
  tags?: Record<string, string[]>;
  links?: Record<string, string>;
  /** Name to ring, when the user got here from the find-a-person list. */
  highlight?: string | null;
  /** name -> training end date, shown against the person in training. */
  trainingEnd?: Record<string, string>;
}) {
  if (!seat) return <div className="m-empty">Single-pilot / two-captain aircraft — no first-officer seat.</div>;
  const o = normSeat(seat);
  const href = (n: string) => (links[n] ? `/candidates/${links[n]}` : undefined);
  const hl = (n: string) => Boolean(highlight && n.toLowerCase() === highlight.toLowerCase());
  const rows: ReactNode[] = [];
  o.line.forEach((n, i) => rows.push(<PersonRow key={`l${i}`} name={n} cls="g" rp="On line" lead={n === leadName} tags={tags?.[n]} href={href(n)} highlight={hl(n)} />));
  o.train.forEach((n, i) =>
    rows.push(
      <PersonRow
        key={`t${i}`}
        name={n}
        cls="t"
        // The end date is the whole point of tracking training, so it belongs
        // where the person is, not only on the Training tab.
        rp={trainingEnd?.[matchKey(n)] ? `Training ends ${trainingEnd[matchKey(n)]}` : "In training"}
        tags={tags?.[n]}
        href={href(n)}
        highlight={hl(n)}
      />
    )
  );
  o.offered.forEach((n, i) => rows.push(<PersonRow key={`of${i}`} name={n} cls="of" rp="Offered" tags={tags?.[n]} href={href(n)} highlight={hl(n)} />));
  o.cand.forEach((n, i) => rows.push(<PersonRow key={`c${i}`} name={n} cls="r" rp="Tentative · external" tags={tags?.[n]} href={href(n)} highlight={hl(n)} />));
  o.candInt.forEach((n, i) => rows.push(<PersonRow key={`ci${i}`} name={n} cls="i" rp="Tentative · internal" tags={tags?.[n]} href={href(n)} highlight={hl(n)} />));
  for (let i = 0; i < o.open; i++) rows.push(<SlotRow key={`o${i}`} label="Open seat" cls="o" rp="Sourcing" />);
  if (showParked) for (let i = 0; i < o.parked; i++) rows.push(<SlotRow key={`p${i}`} label="On hold (parked)" cls="p" rp="Not counted" />);
  if (rows.length === 0) return <div className="m-empty">No crew listed.</div>;
  return <>{rows}</>;
}

/**
 * Move-target options: every non-pool aircraft/seat except the source seat,
 * split into the same two groups the chart itself uses.
 *
 * THE BUG THIS FIXES: the label used to be the aircraft TYPE alone, so the six
 * managed PC-12s produced six identical "PC-12 — First Officer" entries with
 * nothing to tell them apart. A pilot was moved onto a managed tail when a
 * fractional seat was meant, and it was only noticed after the save. Managed
 * entries now carry their tail, and the optgroups mean a fractional seat can no
 * longer be confused for a dedicated one even at a glance.
 */
function moveOptions(allGroups: CrewGroup[], exclude: { gIdx: number; seatKey: SeatKey }) {
  const fractional: { value: string; label: string }[] = [];
  const managed: { value: string; label: string }[] = [];
  allGroups.forEach((g, i) => {
    if (g.poolFlown) return;
    (["pic", "sic", "cabin"] as SeatKey[]).forEach((sk) => {
      if (sk === "cabin" && !g.cabin) return; // can't retarget cabin on a no-cabin aircraft
      if (i === exclude.gIdx && sk === exclude.seatKey) return;
      // A seat the aircraft does not have yet is still a valid destination —
      // moving someone there creates it — but say so, because "PC-12 First
      // Officer (N418T)" on a single-pilot tail otherwise looks like an
      // existing seat sitting empty.
      const isNew = !g[sk];
      const label = `${positionLabel(g, SEAT_LABEL[sk])}${isNew ? " · adds a seat" : ""}`;
      (g.pool === "Managed" ? managed : fractional).push({ value: `${i}|${sk}`, label });
    });
  });
  return [
    { group: "Fractional / Charter", options: fractional },
    { group: "Managed / Dedicated", options: managed }
  ].filter((g) => g.options.length > 0);
}

/** One editable seat column in the edit-mode modal. Module-scoped so its
    "add name" input keeps focus across the parent's re-renders. */
function EditCol({
  group,
  gIdx,
  seatKey,
  label,
  allGroups,
  movePick,
  onAdd,
  onRemove,
  onAdjustOpen,
  onRemoveNamed,
  onToggleTrain,
  onSetMove,
  onMove,
  links,
  onLink,
  onUnlink
}: {
  group: CrewGroup;
  gIdx: number;
  seatKey: SeatKey;
  label: string;
  allGroups: CrewGroup[];
  movePick: MovePick | null;
  onAdd: (name: string, bucket: FillBucket, fillsNamed?: string) => void;
  onRemove: (bucket: FillBucket, name: string) => void;
  onAdjustOpen: (delta: number) => void;
  onRemoveNamed: (label: string) => void;
  onToggleTrain: (name: string, toTrain: boolean) => void;
  onSetMove: (p: MovePick | null) => void;
  onMove: (from: MovePick, toIdx: number, toSeat: SeatKey, bucket: FillBucket) => void;
  links: Record<string, string>;
  onLink: (name: string, candidateId: string) => void;
  onUnlink: (name: string) => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftBucket, setDraftBucket] = useState<FillBucket>("line");
  // Which NAMED opening this person is filling, if any. Empty = an extra seat.
  const [fillsNamed, setFillsNamed] = useState("");
  const [moveDest, setMoveDest] = useState("");
  const [moveStatus, setMoveStatus] = useState<FillBucket>("line");
  // Which person's link picker is open.
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const o = normSeat(group[seatKey]);
  const filled = o.line.length + o.train.length;
  const total = filled + o.open + o.openNamed.length + o.cand.length + o.candInt.length + o.offered.length;

  const row = (name: string, bucket: FillBucket, tone: string, tag?: string) => {
    const isMoving =
      !!movePick && movePick.gIdx === gIdx && movePick.seatKey === seatKey && movePick.bucket === bucket && movePick.name === name;
    const linkedId = links[name];
    const isLinking = linkFor === name;
    return (
      <div className={`ec-row ${bucket === "offered" ? "of" : ""}`} key={`${bucket}-${name}`}>
        <div className="ec-line">
          <span className={`ec-dot ${tone}`} />
          <span className="ec-nm">
            {linkedId ? (
              <Link href={`/candidates/${linkedId}`} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
                {name}
              </Link>
            ) : (
              name
            )}
          </span>
          {tag ? <span className="ec-tag">{tag}</span> : null}
          <span className="ec-act">
            {bucket === "line" ? (
              <button type="button" onClick={() => onToggleTrain(name, true)} title="Mark as in training">
                →trng
              </button>
            ) : null}
            {bucket === "train" ? (
              <button type="button" onClick={() => onToggleTrain(name, false)} title="Mark as on the line">
                →line
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (isMoving) {
                  onSetMove(null);
                } else {
                  setMoveDest("");
                  setMoveStatus("line");
                  onSetMove({ gIdx, seatKey, bucket, name });
                }
              }}
              title="Move to another aircraft"
            >
              move
            </button>
            <button
              type="button"
              style={{ ...orgLinkBtnStyle, borderColor: linkedId ? "var(--green, #2e7d32)" : undefined, color: linkedId ? "var(--green, #2e7d32)" : undefined }}
              title={linkedId ? "Linked to a candidate profile" : "Link to a candidate profile"}
              onClick={() => setLinkFor(isLinking ? null : name)}
            >
              {linkedId ? "linked" : "link"}
            </button>
            <button type="button" className="del" onClick={() => onRemove(bucket, name)} title="Remove">
              ✕
            </button>
          </span>
        </div>
        {isLinking ? (
          <div>
            {linkedId ? (
              <button type="button" style={{ ...orgLinkBtnStyle, marginBottom: 4 }} onClick={() => { onUnlink(name); setLinkFor(null); }}>
                Unlink from current candidate
              </button>
            ) : null}
            <LinkPicker
              initialQuery={name}
              onPick={(candidateId) => {
                onLink(name, candidateId);
                setLinkFor(null);
              }}
              onCancel={() => setLinkFor(null)}
            />
          </div>
        ) : null}
        {isMoving ? (
          <div className="ec-move">
            <select value={moveDest} onChange={(e) => setMoveDest(e.target.value)} aria-label="Move destination">
              <option value="" disabled>
                Move to…
              </option>
              {moveOptions(allGroups, { gIdx, seatKey }).map((grp) => (
                <optgroup key={grp.group} label={grp.group}>
                  {grp.options.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select value={moveStatus} onChange={(e) => setMoveStatus(e.target.value as FillBucket)} aria-label="Arrival status">
              <option value="line">On line</option>
              <option value="train">In training</option>
              <option value="offered">Offered</option>
              <option value="cand">Tentative · external</option>
              <option value="candInt">Tentative · internal</option>
            </select>
            <button
              type="button"
              disabled={!moveDest}
              onClick={() => {
                const [ti, ts] = moveDest.split("|");
                onMove({ gIdx, seatKey, bucket, name }, Number(ti), ts as SeatKey, moveStatus);
              }}
            >
              Move
            </button>
            <button type="button" onClick={() => onSetMove(null)}>
              cancel
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="m-col ec">
      <div className="colh">
        <span>{label}</span>
        <span>
          {filled}/{total}
        </span>
      </div>
      {o.line.map((n) => row(n, "line", "g"))}
      {o.train.map((n) => row(n, "train", "t", "training"))}
      {o.offered.map((n) => row(n, "offered", "of", "offered"))}
      {o.cand.map((n) => row(n, "cand", "r", "tentative"))}
      {o.candInt.map((n) => row(n, "candInt", "i", "internal"))}
      {o.openNamed.map((l, i) => (
        <div className="ec-named" key={`on${i}`}>
          <span className="ec-named-label">{l} · <span>named opening</span></span>
          <button type="button" className="ec-named-x" onClick={() => onRemoveNamed(l)} aria-label={`Remove the ${l} opening`} title="Remove this opening">×</button>
        </div>
      ))}
      <div className="ec-open">
        <span>Open seats</span>
        <button type="button" onClick={() => onAdjustOpen(-1)} disabled={o.open === 0} aria-label="Remove an open seat">
          −
        </button>
        <b>{o.open}</b>
        <button type="button" onClick={() => onAdjustOpen(1)} aria-label="Add an open seat">
          +
        </button>
      </div>
      <form
        className="ec-add"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(draftName, draftBucket, fillsNamed || undefined);
          setDraftName("");
          setFillsNamed("");
        }}
      >
        <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Add name…" />
        <select value={draftBucket} onChange={(e) => setDraftBucket(e.target.value as FillBucket)} aria-label="How to add this person">
          <option value="line">On line</option>
          <option value="train">In training</option>
          <option value="offered">Offered</option>
          <option value="cand">Tentative · external</option>
          <option value="candInt">Tentative · internal</option>
        </select>
        {o.openNamed.length > 0 && (
          <select value={fillsNamed} onChange={(e) => setFillsNamed(e.target.value)} aria-label="Which opening this person fills">
            <option value="">Adds a new seat</option>
            {o.openNamed.map((l, i) => (
              <option key={`f${i}`} value={l}>Fills: {l}</option>
            ))}
          </select>
        )}
        <button type="submit" disabled={!draftName.trim()}>
          Add
        </button>
      </form>
      <div className="ec-addhint">
        Adding a person fills one open seat (if any). A NAMED opening is only filled when you pick it above —
        otherwise the person is an extra seat on top of it.
      </div>
    </div>
  );
}

const depNote = (x: Departure) => (x.to ? `to ${x.to}${x.reason ? ` · ${x.reason}` : ""}` : x.reason || "departing");

function Transitions({ d, training, today }: { d: CrewGroup; training: TrainingRecord[]; today: string | null }) {
  const [showOld, setShowOld] = useState(false);
  // A pilot's own training record beats the static CREW_TRAINING seed — the
  // record is what someone can actually edit, so it has to be what shows.
  // Tolerant name matching (chart "Brock Tyler" vs sheet "Joshua (Brock) Tyler"),
  // and only LIVE records — an archived 2024 course does not describe what
  // somebody is doing now.
  const byName = new Map(training.filter((r) => !r.archived).map((r) => [matchKey(r.name), r]));
  const trainNote = (n: string) => {
    const rec = byName.get(matchKey(n));
    if (rec?.end) return `in training · ends ${rec.end}${rec.vendor ? ` · ${rec.vendor}` : ""}`;
    return CREW_TRAINING[n] || "arriving · in training";
  };

  const inn: { name: string; note: string }[] = [];
  [d.pic, d.sic, d.cabin].forEach((seat) => {
    if (!seat) return;
    (seat.train || []).forEach((n) => inn.push({ name: n, note: trainNote(n) }));
    (seat.offered || []).forEach((n) => inn.push({ name: n, note: "offered" }));
    (seat.cand || []).forEach((n) => inn.push({ name: n, note: "tentative · external" }));
    (seat.candInt || []).forEach((n) => inn.push({ name: n, note: "tentative · internal" }));
  });

  // Departures older than a month drop out of the default view. See
  // isDepartureArchived — it is DERIVED from the date, nothing is written, and
  // an undated departure (a tentative move, which has not happened yet) is
  // never archived.
  const { current, archived } = splitDepartures(d.out, today);
  const out = (showOld ? [...current, ...archived] : current).map((x) => ({ name: x.name, note: depNote(x) }));

  const block = (title: string, cls: string, arr: { name: string; note: string }[], extra?: ReactNode) => (
    <div className={`tcard ${cls}`}>
      <div className="th">
        {title} ({arr.length})
      </div>
      {arr.length ? (
        arr.map((x, i) => (
          <div key={i} className="ti">
            <b>{x.name}</b>
            <span className="tz">{x.note}</span>
          </div>
        ))
      ) : (
        <div className="tnone">None recorded</div>
      )}
      {extra}
    </div>
  );

  return (
    <div className="m-move">
      <div className="mh4">Pilot movement</div>
      <div className="mgrid">
        {block("Transitioning in", "inn", inn)}
        {block(
          "Transitioning out",
          "outt",
          out,
          archived.length ? (
            <button
              type="button"
              onClick={() => setShowOld((v) => !v)}
              style={{ background: "none", border: "none", padding: "4px 0 0", font: "inherit", fontSize: 11, opacity: 0.7, cursor: "pointer", color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {showOld ? "Hide" : "Show"} {archived.length} archived · left over {DEPARTURE_ARCHIVE_DAYS} days ago
            </button>
          ) : null
        )}
      </div>
    </div>
  );
}

export default function CrewOrgChart({
  initialGroups,
  initialLinks,
  initialTraining,
  canEdit = false
}: {
  initialGroups?: CrewGroup[];
  initialLinks?: Record<string, string>;
  initialTraining?: TrainingRecord[];
  canEdit?: boolean;
} = {}) {
  const [sort, setSort] = useState<SortKey>("Fleet size");
  const [parked, setParked] = useState<ParkedKey>("hide");
  const [tab, setTab] = useState<TabKey>("chart");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const showParked = parked === "show";

  // Today's date, read AFTER mount. Reading the clock during render would make
  // the server and the client disagree about which departures are archived and
  // who has finished training, which is a hydration error. Null until mounted =
  // "no date yet", and every date-dependent view is written to show the safe,
  // unfiltered thing in that state.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(isoToday()), []);

  const [groupsData, setGroupsData] = useState<CrewGroup[]>(() => initialGroups ?? CREW_GROUPS);
  const [savedGroups, setSavedGroups] = useState<CrewGroup[]>(() => initialGroups ?? CREW_GROUPS);
  // name -> candidateId, edited alongside the roster and saved with it.
  const [links, setLinks] = useState<Record<string, string>>(() => initialLinks ?? {});
  const [savedLinks, setSavedLinks] = useState<Record<string, string>>(() => initialLinks ?? {});
  // Training records, edited and saved alongside the roster in the same blob.
  const [training, setTraining] = useState<TrainingRecord[]>(() => initialTraining ?? []);
  const [savedTraining, setSavedTraining] = useState<TrainingRecord[]>(() => initialTraining ?? []);
  // "Find a person" panel, and who to highlight once their card opens.
  const [findOpen, setFindOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  // Which finished-training pilots have been dismissed for this visit. Local
  // only: dismissing is "not now", not a decision worth writing to a shared
  // database, and it should come back tomorrow if nobody acted on it.
  const [dismissedTraining, setDismissedTraining] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [movePick, setMovePick] = useState<MovePick | null>(null);
  // When a person LINKED to an employee is moved, we offer to record the matching
  // role change on their journey. Null unless that offer is open.
  const [rolePrompt, setRolePrompt] = useState<{
    name: string;
    hireId: string;
    currentTitle: string | null;
    seat: "PIC" | "SIC" | null;
    aircraft: string;
  } | null>(null);
  const [roleTitle, setRoleTitle] = useState("");
  const [roleDate, setRoleDate] = useState("");
  const [roleType, setRoleType] = useState("TRANSFER");
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleErr, setRoleErr] = useState<string | null>(null);
  const [roleDone, setRoleDone] = useState<string | null>(null);
  // "Duplicate this aircraft" — the index of the card being copied, plus the new
  // tail's details. dupFrom is null unless the form is open.
  const [dupFrom, setDupFrom] = useState<number | null>(null);
  const [dupType, setDupType] = useState("");
  const [dupTail, setDupTail] = useState("");
  const [dupOwner, setDupOwner] = useState("");
  const [dupErr, setDupErr] = useState<string | null>(null);
  // Per-card editing: the group index whose card is open for editing, plus the
  // roster as it stood when that editor opened (what Cancel restores).
  const [cardEdit, setCardEdit] = useState<number | null>(null);
  const [cardSnapshot, setCardSnapshot] = useState<{ groups: CrewGroup[]; links: Record<string, string> } | null>(null);

  const dirty = useMemo(
    () =>
      JSON.stringify(groupsData) !== JSON.stringify(savedGroups) ||
      JSON.stringify(links) !== JSON.stringify(savedLinks) ||
      JSON.stringify(training) !== JSON.stringify(savedTraining),
    [groupsData, savedGroups, links, savedLinks, training, savedTraining]
  );
  /** Has anything changed since THIS card editor opened? Drives its Save button
      and the discard prompt — separate from `dirty`, which is chart-wide. */
  const cardDirty = useMemo(
    () =>
      cardSnapshot !== null &&
      (JSON.stringify(groupsData) !== JSON.stringify(cardSnapshot.groups) ||
        JSON.stringify(links) !== JSON.stringify(cardSnapshot.links)),
    [groupsData, links, cardSnapshot]
  );

  const linkPerson = (name: string, candidateId: string) => setLinks((prev) => ({ ...prev, [name]: candidateId }));
  const unlinkPerson = (name: string) =>
    setLinks((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const applyEdit = (fn: (draft: CrewGroup[]) => void) =>
    setGroupsData((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });

  /** Open the duplicate form for a card, prefilled with its aircraft type.
      The tail and owner start blank — they are what makes it a different tail. */
  const startDuplicate = (idx: number) => {
    setDupFrom(idx);
    setDupType(groupsData[idx]?.name ?? "");
    setDupTail("");
    setDupOwner("");
    setDupErr(null);
  };

  /** A seat with the SAME number of seats as the source but nobody in them.
      A new tail inherits the crew LAYOUT, not the crew — so three captains
      becomes three open captain seats. Returns null when the source aircraft
      has no such seat, so "no first officer" stays "no first officer". */
  const emptySeatLike = (seat: Seat | null | undefined): Seat | null => {
    if (!seat) return null;
    const total = cntSeat(normSeat(seat)).at;
    return total > 0 ? { open: total } : null;
  };

  /** Copy an aircraft into a new tail, inserted directly after the source so it
      lands beside it on the chart. Local until Save, like every other edit. */
  const duplicateGroup = () => {
    if (dupFrom == null) return;
    const src = groupsData[dupFrom];
    if (!src) return;

    const type = dupType.trim();
    const tail = dupTail.trim();
    const owner = dupOwner.trim();
    if (!type) return setDupErr("Aircraft type is required.");
    if (!tail) return setDupErr("Tail number is required — it is what identifies the new card.");

    const sub = owner ? `${tail} · ${owner}` : tail;
    if (groupsData.some((g) => g.sub.trim().toLowerCase() === sub.toLowerCase())) {
      return setDupErr(`${tail} is already on the chart.`);
    }

    // Structure carries over; people, tags, departures, notes and the photo do
    // not — those belong to the aircraft we copied, not to the new one.
    const copy: CrewGroup = {
      name: type,
      pool: src.pool,
      sub,
      pic: emptySeatLike(src.pic),
      sic: emptySeatLike(src.sic)
    };
    const cabin = emptySeatLike(src.cabin);
    if (cabin) copy.cabin = cabin;
    if (src.poolFlown) copy.poolFlown = true;

    applyEdit((d) => {
      d.splice(dupFrom + 1, 0, copy);
    });
    setDupFrom(null);
    setOpenIdx(dupFrom + 1);
    // Follow the card editor onto the new tail, so the copy can be saved from
    // the card you are now looking at. The snapshot is untouched, so Cancel
    // still undoes the duplication.
    if (cardEdit !== null) setCardEdit(dupFrom + 1);
  };

  /** Remove an aircraft outright. The escape hatch for a duplicate made in
      error — without it a saved mistake would need a developer.

      In card mode this SAVES IMMEDIATELY: removing the card closes the only
      editor that could have saved it, so leaving the change local would strand
      it. In an "Edit all" session the chart-wide Save still owns it. */
  const removeGroup = (idx: number) => {
    const g = groupsData[idx];
    if (!g) return;
    const cardMode = cardEdit !== null;
    const tail = `${g.name} (${g.sub})`;
    const confirmMsg = cardMode
      ? `Remove ${tail} from the chart? Its pilots come off with it, and this saves immediately.`
      : `Remove ${tail} from the chart? Its pilots come off with it. Nothing is saved until you press Save changes.`;
    if (!window.confirm(confirmMsg)) return;

    const next = groupsData.filter((_, i) => i !== idx);
    setGroupsData(next);
    setOpenIdx(null);
    setDupFrom(null);
    if (cardMode) {
      setCardEdit(null);
      setCardSnapshot(null);
      void postRoster({ groups: next, links, training });
    }
  };

  const addPerson = (gIdx: number, seatKey: SeatKey, bucket: FillBucket, name: string, fillsNamed?: string) => {
    const clean = name.trim();
    if (!clean) return;
    applyEdit((d) => {
      const s = ensureSeat(d[gIdx], seatKey);
      push(s, bucket, clean);
      // Filling a NAMED opening removes that opening, so the person replaces the
      // role rather than sitting alongside it. Without this the head count grows
      // — three cabin attendants plus a "Lead Cabin Attendant" opening plus the
      // new person reads as 5 seats when it should be 4.
      if (fillsNamed && s.openNamed?.length) {
        s.openNamed = s.openNamed.filter((l) => l !== fillsNamed);
        if (s.openNamed.length === 0) delete s.openNamed;
        return;
      }
      // Filling a seat consumes one open req if any exist (a named on-line /
      // in-training / tentative person takes the place of an anonymous opening).
      // If there are no open reqs, the seat count grows instead.
      if ((s.open ?? 0) > 0) {
        const next = (s.open ?? 0) - 1;
        if (next === 0) delete s.open;
        else s.open = next;
      }
    });
  };
  const removePerson = (gIdx: number, seatKey: SeatKey, bucket: FillBucket, name: string) =>
    applyEdit((d) => {
      const s = d[gIdx][seatKey];
      if (s) {
        pull(s, bucket, name);
        // Removing a person reopens the seat (symmetric with add auto-filling one).
        s.open = (s.open ?? 0) + 1;
        tidySeat(d[gIdx], seatKey);
      }
    });
  // Drop a named opening outright — the role was cancelled, or somebody already
  // in the seat turned out to be the person who fills it.
  const removeNamedOpening = (gIdx: number, seatKey: SeatKey, label: string) =>
    applyEdit((d) => {
      const s = d[gIdx][seatKey];
      if (!s?.openNamed) return;
      s.openNamed = s.openNamed.filter((l) => l !== label);
      if (s.openNamed.length === 0) delete s.openNamed;
      tidySeat(d[gIdx], seatKey);
    });
  const adjustOpen = (gIdx: number, seatKey: SeatKey, delta: number) =>
    applyEdit((d) => {
      const s = ensureSeat(d[gIdx], seatKey);
      const next = Math.max(0, (s.open ?? 0) + delta);
      if (next === 0) delete s.open;
      else s.open = next;
      tidySeat(d[gIdx], seatKey);
    });
  const toggleTrain = (gIdx: number, seatKey: SeatKey, name: string, toTrain: boolean) =>
    applyEdit((d) => {
      const s = ensureSeat(d[gIdx], seatKey);
      pull(s, toTrain ? "line" : "train", name);
      push(s, toTrain ? "train" : "line", name);
    });
  const doMove = (from: MovePick, toIdx: number, toSeat: SeatKey, bucket: FillBucket) => {
    applyEdit((d) => {
      const srcGroup = d[from.gIdx];
      const src = srcGroup[from.seatKey];
      if (src) {
        pull(src, from.bucket, from.name);
        // Vacating the source reopens that seat (a backfill req).
        src.open = (src.open ?? 0) + 1;
      }
      const destGroup = d[toIdx];
      // cand/candInt/offered are all "in progress" arrivals — not yet on the line —
      // so the move is tentative and the old seat reopens.
      const tentative = bucket === "cand" || bucket === "candInt" || bucket === "offered";
      // A tentative transfer is "in progress": record it as transitioning-out on
      // the source so the pilot shows leaving the old aircraft.
      if (tentative) {
        // Carries the tail for a managed destination — "to PC-12 First Officer"
        // does not tell anyone which of the six PC-12s he is going to.
        const destLabel = positionLabel(destGroup, SEAT_LABEL[toSeat]);
        srcGroup.out = [...(srcGroup.out ?? []), { name: from.name, to: destLabel, reason: "tentative move" }];
      }
      tidySeat(srcGroup, from.seatKey);
      const t = ensureSeat(destGroup, toSeat);
      push(t, bucket, from.name);
      // Arriving into the seat consumes one open req if any exist.
      if ((t.open ?? 0) > 0) {
        const n = (t.open ?? 0) - 1;
        if (n === 0) delete t.open;
        else t.open = n;
      }
    });
    setMovePick(null);
    // If this pilot is linked to an employee, offer to record the move as a role
    // change on their journey. The chart move and the journey are separate records,
    // so this keeps them in sync — with a confirmation, never automatically.
    void offerRoleChange(from.name, toIdx, toSeat);
  };

  // Look up whether the moved person is a linked employee; if so, open the offer.
  const offerRoleChange = async (name: string, toIdx: number, toSeat: SeatKey) => {
    const candidateId = links[name];
    if (!candidateId) return;
    try {
      const res = await fetch(`/api/candidates/${candidateId}/employee`);
      const data = (await res.json().catch(() => ({}))) as {
        employee?: { hireId: string; name: string; currentTitle: string | null } | null;
      };
      if (!data.employee) return;
      const aircraft = groupsData[toIdx]?.name ?? "";
      const seatWord = toSeat === "pic" ? "Captain" : toSeat === "sic" ? "First Officer" : "Cabin Attendant";
      setRoleTitle(`${aircraft} ${seatWord}`.trim());
      setRoleDate("");
      setRoleType("TRANSFER");
      setRoleErr(null);
      setRolePrompt({
        name,
        hireId: data.employee.hireId,
        currentTitle: data.employee.currentTitle,
        seat: toSeat === "pic" ? "PIC" : toSeat === "sic" ? "SIC" : null,
        aircraft
      });
    } catch {
      /* the chart move still stands; we just don't offer the role change */
    }
  };

  const recordRoleChange = async () => {
    if (!rolePrompt) return;
    if (!roleTitle.trim()) {
      setRoleErr("Give the new role a title.");
      return;
    }
    if (!roleDate) {
      setRoleErr("Pick the date this takes effect.");
      return;
    }
    setRoleBusy(true);
    setRoleErr(null);
    try {
      const res = await fetch(`/api/new-hires/${rolePrompt.hireId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: roleTitle.trim(),
          startDate: roleDate,
          transitionType: roleType,
          seat: rolePrompt.seat,
          aircraft: rolePrompt.aircraft
        })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Could not record the role change.");
      setRoleDone(`Recorded ${rolePrompt.name}: now ${roleTitle.trim()}.`);
      setRolePrompt(null);
    } catch (e) {
      setRoleErr(e instanceof Error ? e.message : "Could not record the role change.");
    } finally {
      setRoleBusy(false);
    }
  };
  const removeOut = (gIdx: number, index: number) =>
    applyEdit((d) => {
      const g = d[gIdx];
      if (g.out) {
        g.out = g.out.filter((_, i) => i !== index);
        if (!g.out.length) delete g.out;
      }
    });
  /** Date a departure. This is what lets it age out of the default view a month
      later; clearing the date brings it back and keeps it there. */
  const setOutDate = (gIdx: number, index: number, date: string) =>
    applyEdit((d) => {
      const dep = d[gIdx].out?.[index];
      if (!dep) return;
      if (date) dep.date = date;
      else delete dep.date;
    });

  /**
   * Move a pilot whose training has ended onto the line — the confirm half of
   * the "training is over" prompt.
   *
   * Deliberately NOT automatic. Training slips, gets rescheduled and is
   * sometimes failed, so a date passing is a reason to ASK, never a reason to
   * mark somebody line-ready. This also marks their training record complete,
   * so the same pilot cannot be offered again.
   *
   * Saves immediately: the prompt is reachable without any editor open, so
   * leaving the change local would strand it somewhere with no Save button.
   */
  const moveTrainedToLine = async (person: { name: string; recordId: string; gIdx: number; seatKey: SeatKey; aircraft: string }) => {
    if (!window.confirm(`Move ${person.name} from training onto the line on the ${person.aircraft}? This saves straight away.`)) return;
    const nextGroups = structuredClone(groupsData);
    const seat = ensureSeat(nextGroups[person.gIdx], person.seatKey);
    pull(seat, "train", person.name);
    push(seat, "line", person.name);
    // Stamp the SPECIFIC record by id, not every record for that name - a pilot
    // can have several courses, and marking their 2024 history complete because
    // they finished a 2026 course would be nonsense.
    const nextTraining = training.map((r) => (r.id === person.recordId ? { ...r, completedAt: today ?? undefined } : r));
    setGroupsData(nextGroups);
    setTraining(nextTraining);
    const ok = await postRoster({ groups: nextGroups, links, training: nextTraining });
    // The chart move and the employee's journey are separate records, so offer
    // the role change too — the same offer a manual move makes.
    if (ok) void offerRoleChange(person.name, person.gIdx, person.seatKey);
  };

  const postRoster = async (body: unknown): Promise<boolean> => {
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch("/api/workspace-settings/fleet-crew-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { groups: CrewGroup[]; links?: Record<string, string>; training?: TrainingRecord[] };
      setGroupsData(data.groups);
      setSavedGroups(data.groups);
      const nextLinks = data.links ?? {};
      setLinks(nextLinks);
      setSavedLinks(nextLinks);
      const nextTraining = data.training ?? [];
      setTraining(nextTraining);
      setSavedTraining(nextTraining);
      return true;
    } catch {
      setSaveErr("Couldn't save — check your connection or that you're signed in as an admin.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const save = () => void postRoster({ groups: groupsData, links, training });
  const resetSeed = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset the crew chart to the original source data? This discards all saved manual edits.")) return;
    void postRoster({ reset: true });
  };
  // Leave edit mode, dropping any unsaved local changes (a plain "cancel").
  // ALWAYS confirm when there is something to lose: this button sits one click
  // from discarding a whole "Edit all" pass, and it did exactly that to someone.
  const exitEdit = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this chart? Everything you have edited since the last save will be lost.")) return;
    setGroupsData(savedGroups);
    setLinks(savedLinks);
    setTraining(savedTraining);
    setMovePick(null);
    setSaveErr(null);
    setEditMode(false);
  };

  // --- per-card editing ----------------------------------------------------
  // The team's instinct is to click the aircraft they want to change, so a card
  // carries its own Edit / Save / Cancel. The chart-wide mode still exists for
  // bulk work ("Edit all"), which is why both can be true at once.
  //
  // Cancel restores a snapshot taken when the card was opened for editing,
  // rather than reverting one group by index: a MOVE deliberately touches two
  // aircraft (the pilot leaves one and lands on another), so reverting only the
  // card you were on would strand the other half of the move.
  const startCardEdit = (idx: number) => {
    setCardSnapshot({ groups: structuredClone(groupsData), links: { ...links } });
    setCardEdit(idx);
    setSaveErr(null);
  };
  const cancelCardEdit = () => {
    if (cardSnapshot) {
      setGroupsData(cardSnapshot.groups);
      setLinks(cardSnapshot.links);
    }
    setCardSnapshot(null);
    setCardEdit(null);
    setMovePick(null);
    setDupFrom(null);
    setSaveErr(null);
  };
  const saveCardEdit = async () => {
    const ok = await postRoster({ groups: groupsData, links, training });
    if (!ok) return; // leave the editor open so the changes aren't lost
    setCardSnapshot(null);
    setCardEdit(null);
    setMovePick(null);
    setDupFrom(null);
  };
  /** Open a card. If a DIFFERENT card is mid-edit with unsaved changes, ask
      first — switching cards would otherwise strand that work somewhere the
      user can no longer see or save it. */
  const openCard = (idx: number) => {
    if (cardEdit !== null && cardEdit !== idx) {
      if (cardDirty && !window.confirm("Discard the unsaved changes to the aircraft you were editing?")) return;
      cancelCardEdit();
    }
    setOpenIdx(idx);
  };

  /** Unsaved work in a card editor should never disappear to a stray click. */
  const closeModal = () => {
    if (cardEdit !== null && cardDirty) {
      if (!window.confirm("Discard the unsaved changes to this aircraft?")) return;
      cancelCardEdit();
    } else if (cardEdit !== null) {
      cancelCardEdit();
    }
    setOpenIdx(null);
    setHighlight(null);
  };

  const groups = groupsData.map((d, idx) => {
    const p = normSeat(d.pic);
    const s = d.sic ? normSeat(d.sic) : null;
    const cp = cntSeat(p);
    const cs = s ? cntSeat(s) : null;
    const o = cp.o + (cs ? cs.o : 0);
    const tr = cp.tr + (cs ? cs.tr : 0);
    let status = "STAFFED";
    let bBg = "var(--fill-soft)";
    let bFg = "var(--fill-fg)";
    let rule = "var(--green)";
    if (o > 0) {
      status = "HIRING";
      bBg = "var(--open-soft-bg)";
      bFg = "var(--open-soft-fg)";
      rule = "var(--accent)";
    } else if (tr > 0) {
      status = "TRAINING";
      bBg = "var(--train-bg)";
      bFg = "var(--train-fg)";
      rule = "var(--gold)";
    }
    return { d, idx, cp, cs, o, tr, status, bBg, bFg, rule };
  });

  /**
   * Everyone on the chart, flattened, for the "Find a person" panel.
   *
   * Built from groupsData rather than the sorted display list so a person's
   * entry does not move when the cards are re-sorted, and so it includes people
   * on cards the current filters would hide.
   */
  const indexEntries = useMemo<IndexEntry[]>(() => {
    const out: IndexEntry[] = [];
    const BUCKETS: { key: FillBucket; tone: IndexEntry["tone"]; word: string }[] = [
      { key: "line", tone: "g", word: "on line" },
      { key: "train", tone: "t", word: "in training" },
      { key: "offered", tone: "of", word: "offered" },
      { key: "cand", tone: "r", word: "tentative · external" },
      { key: "candInt", tone: "i", word: "tentative · internal" }
    ];
    groupsData.forEach((g, gIdx) => {
      (["pic", "sic", "cabin"] as SeatKey[]).forEach((sk) => {
        const seat = normSeat(g[sk]);
        BUCKETS.forEach(({ key, tone, word }) => {
          seat[key].forEach((name) => {
            out.push({
              name,
              where: aircraftLabel(g),
              role: `${SEAT_LABEL[sk]} · ${word}`,
              tone,
              cardIdx: gIdx,
              ...(links[name] ? { candidateId: links[name] } : {})
            });
          });
        });
      });
    });
    return out;
  }, [groupsData, links]);

  /** Open the card a person sits on and mark them, from the find panel or the
      training tab. Both are "show me where this is", not navigation. */
  const showPerson = (name: string, cardIdx?: number) => {
    const idx = cardIdx ?? indexEntries.find((e) => e.name.toLowerCase() === name.toLowerCase())?.cardIdx;
    if (idx == null) return;
    setTab("chart");
    setFindOpen(false);
    setHighlight(name);
    openCard(idx);
  };

  /** name -> training end date, for the person rows on an aircraft card. */
  const trainingEnds = useMemo(() => {
    const out: Record<string, string> = {};
    // Keyed by the CHART name via the tolerant match, and only from live
    // records - an archived course from two years ago is not what the person
    // sitting in a training seat today is waiting on. Latest end date wins when
    // somebody has more than one open course.
    for (const r of training) {
      if (!r.end || r.archived || r.confirmation === "Canceled") continue;
      const key = matchKey(r.name);
      if (!out[key] || r.end > out[key]) out[key] = r.end;
    }
    return out;
  }, [training]);

  const isTraining = tab === "training";

  /** Counts for the Training header. Derived from trainingRows so the header and
      the table can never disagree — the table adds chart-derived placeholders
      for pilots in a training seat with no record, and those count as active. */
  const trainingCounts = useMemo(() => {
    const rows = trainingRows(groupsData, training, today);
    const archived = rows.filter((r) => r.archived).length;
    return { active: rows.length - archived, archived };
  }, [groupsData, training, today]);

  // Finished training and still sitting in a training seat — the people the
  // banner asks about. Dismissals are per-visit, so nobody is silently dropped.
  const finished = useMemo(
    () => completedTraining(groupsData, training, today).filter((p) => !dismissedTraining.includes(p.name)),
    [groupsData, training, today, dismissedTraining]
  );

  const counted = groups.filter((g) => !g.d.noCount);
  // filled includes in-training (a signed pilot fills the seat, even pre-line)
  const filled = counted.reduce((a, g) => a + g.cp.f + g.cp.tr + (g.cs ? g.cs.f + g.cs.tr : 0), 0);
  const open = counted.reduce((a, g) => a + g.o, 0);
  const target = counted.reduce((a, g) => a + g.cp.at + (g.cs ? g.cs.at : 0), 0);
  const hiring = counted.filter((g) => g.o > 0).length;

  // Card heights are equalized purely in CSS now (the grid stretches each row —
  // see .grid/.card in OrgChart.module.css). The old JS pass that measured and set
  // minHeight raced the Archivo web-font load and left cards uneven until a refresh.

  useUnsavedGuard(dirty, "You have unsaved changes to the crew chart. Leave this page and lose them?");

  // Escape closes the card. Routed through a ref because closeModal now has to
  // check for unsaved card edits, and this listener is bound once.
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModalRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  type G = (typeof groups)[number];
  const sortG = (list: G[]) => {
    const a = list.slice();
    if (sort === "Open seats") a.sort((x, y) => y.o - x.o);
    return a;
  };

  const Card = ({ g }: { g: G }) => {
    if (g.d.poolFlown) {
      return (
        <div className="gcol">
          <div
            className="card"
            tabIndex={0}
            role="button"
            onClick={() => openCard(g.idx)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openCard(g.idx);
              }
            }}
          >
            <div className="statusbar n">
              <span className="word">Shared</span>
            </div>
            <div className="ch">
              <div>
                <div className="nm">{g.d.name}</div>
                <div className="kk" style={{ marginTop: 6 }}>
                  {g.d.sub}
                </div>
              </div>
            </div>
            <div className="bd">
              <div className="shared" style={{ marginTop: 0 }}>
                {g.d.poolNote || "Crew drawn from the shared fractional pool — no dedicated seat or open req."}
              </div>
            </div>
            <div className="foot">
              <span className="kk" style={{ color: "inherit", opacity: 0.85 }}>
                Open reqs
              </span>
              <span className="n">0</span>
            </div>
          </div>
        </div>
      );
    }
    const totFilled = g.cp.f + g.cp.tr + (g.cs ? g.cs.f + g.cs.tr : 0);
    const totTgt = g.cp.at + (g.cs ? g.cs.at : 0);
    const cabinCount = g.d.cabin ? cntSeat(normSeat(g.d.cabin)) : null;
    // arrivals = in-training + offered + tentative (external + internal) across the seats
    const arrivals = (seat?: Seat | null) => {
      const s = normSeat(seat);
      return s.train.length + s.offered.length + s.cand.length + s.candInt.length;
    };
    const inN = arrivals(g.d.pic) + arrivals(g.d.sic) + arrivals(g.d.cabin);
    // Archived departures are out of the count too, not just out of the list —
    // a card reading "3 out" for people who left in the spring is the same
    // stale signal, one level up.
    const outN = splitDepartures(g.d.out, today).current.length;
    const tn = turnoverFor(g.d);
    const turnEl = (
      <>
        Turnover <b>{tn && tn.r != null ? `${tn.r}%` : "—"}</b>
        {tn && tn.t != null ? (
          <>
            {" "}
            · fill <b>{tn.t}d</b>
          </>
        ) : null}
      </>
    );
    const barCls = g.o > 0 ? "r" : g.tr > 0 ? "y" : "g";
    const barWord = g.o > 0 ? "Hiring" : g.tr > 0 ? "Training" : "Staffed";
    return (
      <div className="gcol">
        <div
          className="card"
          tabIndex={0}
          role="button"
          onClick={() => openCard(g.idx)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openCard(g.idx);
            }
          }}
        >
          <div className={`statusbar ${barCls}`}>
            <span className="word">{barWord}</span>
          </div>
          <div className="ch">
            <div>
              <div className="nm">{g.d.name}</div>
              <div className="kk" style={{ marginTop: 6 }}>
                {g.d.sub}
              </div>
            </div>
          </div>
          <div className="meta">
            <span className="seats-txt">
              {totFilled} of {totTgt} seats
            </span>
            <span className="flow">
              <span className={inN ? "flow-in" : "flow-z"}>↑ {inN} in</span>
              <span className="flow-z">·</span>
              <span className="flow-out">↓ {outN} out</span>
            </span>
          </div>
          <div className="bd">
            <div className="row">
              <div className="kk">
                Captains ·{" "}
                <span className={`cnt${g.cp.o >= 2 ? " alert" : ""}`}>
                  <b>{g.cp.f + g.cp.tr}</b>/{g.cp.at}
                </span>
              </div>
              <SeatSquares seat={g.d.pic} showParked={showParked} />
            </div>
            {g.cs ? (
              <div className="row">
                <div className="kk">
                  First Officers ·{" "}
                  <span className={`cnt${g.cs.o >= 2 ? " alert" : ""}`}>
                    <b>{g.cs.f + g.cs.tr}</b>/{g.cs.at}
                  </span>
                </div>
                <SeatSquares seat={g.d.sic} showParked={showParked} />
              </div>
            ) : (
              <div className="row">
                <div className="kk">First Officers</div>
                <div className="shared">{g.d.pool === "SkyShare" ? "shared crew" : "no first-officer seat"}</div>
              </div>
            )}
            {g.d.cabin && cabinCount ? (
              <div className="row">
                <div className="kk">
                  Cabin ·{" "}
                  <span className={`cnt${cabinCount.o >= 2 ? " alert" : ""}`}>
                    <b>{cabinCount.f + cabinCount.tr}</b>/{cabinCount.at}
                  </span>
                </div>
                <SeatSquares seat={g.d.cabin} showParked={showParked} />
              </div>
            ) : null}
            {g.d.note ? <div className="cardnote">{g.d.note}</div> : null}
            {showParked ? <div className="turn">{turnEl}</div> : null}
          </div>
          <div className="foot">
            <span className="kk" style={{ color: "inherit", opacity: 0.85 }}>
              Open reqs
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="taphint" style={{ color: "var(--n400)" }}>
                view crew
              </span>
              <span className="n">{g.o}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ title, list, bg, fg }: { title: string; list: G[]; bg: string; fg: string }) => {
    const cl = list.filter((g) => !g.d.noCount);
    const f = cl.reduce((n, g) => n + g.cp.f + g.cp.tr + (g.cs ? g.cs.f + g.cs.tr : 0), 0);
    const t = cl.reduce((n, g) => n + g.cp.at + (g.cs ? g.cs.at : 0), 0);
    const op = cl.reduce((n, g) => n + g.o, 0);
    return (
      <>
        <div className="divband" style={{ background: bg, color: fg }}>
          <div className="divtitle">{title}</div>
          <div className="divinline">
            {f}/{t} filled · <b>{op}</b> open
          </div>
        </div>
        <div className="grid">
          {sortG(list).map((g) => (
            <Card key={g.idx} g={g} />
          ))}
        </div>
      </>
    );
  };

  const ssG = groups.filter((g) => g.d.pool === "SkyShare");
  const mgG = groups.filter((g) => g.d.pool === "Managed");

  const active = openIdx != null ? groupsData[openIdx] : null;
  // The open card is editable either because this one card is being edited, or
  // because the whole chart is in the bulk "Edit all" session.
  const cardEditing = cardEdit !== null && cardEdit === openIdx;
  const isEditing = editMode || cardEditing;
  const ap = active ? normSeat(active.pic) : null;
  const as = active && active.sic ? normSeat(active.sic) : null;
  const acp = ap ? cntSeat(ap) : null;
  const acs = as ? cntSeat(as) : null;
  const acab = active && active.cabin ? normSeat(active.cabin) : null;
  const acabc = acab ? cntSeat(acab) : null;

  return (
    // The Training tab is a wide table rather than the card grid the 1320px cap
    // was sized for, so the shell widens to the viewport while that tab is open
    // and snaps back for the chart.
    <div className={`${styles.wrap}${isTraining ? ` ${styles.wide}` : ""}`} ref={wrapRef}>
      {/* The header BELONGS TO THE ACTIVE TAB. Training is a different screen —
          its own blue rule, its own eyebrow and title, its own description and
          its own headline number — because the chart identity sitting above a
          training table told people the chart controls applied to it. */}
      <div className={`hd${isTraining ? " trn" : ""}`}>
        <div>
          <div className="kk" style={{ color: isTraining ? "var(--int-bd)" : "var(--gold)" }}>
            SkyShare · Flight Operations{isTraining ? " · Training" : ""}
          </div>
          <div className="ttl">{isTraining ? "Crew Training" : "Crew Org Chart"}</div>

          <div className="tabstrip" role="tablist" aria-label="Crew views">
            <button role="tab" aria-selected={!isTraining} className={!isTraining ? "on" : ""} onClick={() => setTab("chart")}>
              Chart
            </button>
            <button
              role="tab"
              aria-selected={isTraining}
              className={isTraining ? "on trn" : ""}
              onClick={() => setTab("training")}
            >
              Training{finished.length ? ` (${finished.length})` : ""}
            </button>
          </div>

          <div className="desc" style={{ marginTop: 12 }}>
            {isTraining ? (
              <>
                Every pilot in training and when it ends. <b>Once a training end date passes, the chart offers to move that pilot to the line</b> — it
                never moves anyone on its own.
              </>
            ) : (
              <>
                Flight Operations by aircraft group — fractional/charter aircraft plus each managed tail.{" "}
                <b>Click any aircraft to see its pilots{canEdit ? " — and to edit that aircraft" : ""}.</b> In-training pilots count as filled; turnover &amp; parked seats live under Additional info.
              </>
            )}
          </div>

          {/* Chart-only controls. They are not merely hidden on the Training tab
              — they are not rendered, so there is nothing to click that quietly
              does nothing. Training brings its own toolbar inside TrainingTab,
              including a search that already covers names, seats and locations,
              which is why Find a person is not repeated here. */}
          {!isTraining ? (
          <div className="ctrls">
            {/* Finding a person by NAME. The chart is organised by aircraft,
                which is right for staffing and useless for "where is he?" —
                with 26 tails you open cards until you find them. */}
            <div className="seg">
              <span className="lbl">People</span>
              <button className={findOpen ? "on" : ""} onClick={() => setFindOpen((v) => !v)}>
                {findOpen ? "Close list" : "Find a person"}
              </button>
            </div>
            <div className="seg">
              <span className="lbl">Sort</span>
              <button className={sort === "Fleet size" ? "on" : ""} onClick={() => setSort("Fleet size")}>
                Fleet size
              </button>
              <button className={sort === "Open seats" ? "on" : ""} onClick={() => setSort("Open seats")}>
                Open seats
              </button>
            </div>
            <div className="seg">
              <span className="lbl">Additional info</span>
              <button className={parked === "hide" ? "on" : ""} onClick={() => setParked("hide")}>
                Hide
              </button>
              <button className={parked === "show" ? "on" : ""} onClick={() => setParked("show")}>
                Show
              </button>
            </div>
            {/* Editing is per card now — click an aircraft and edit it there.
                This stays only as the bulk fallback for a whole-chart session. */}
            {canEdit ? (
              <div className="seg">
                <span className="lbl">Roster</span>
                <button
                  className={editMode ? "on" : ""}
                  onClick={() => {
                    if (editMode) exitEdit();
                    else {
                      // Switching to a bulk session would revert an open card
                      // editor, so never do that silently.
                      if (cardEdit !== null && cardDirty && !window.confirm("Discard the unsaved changes to the aircraft you were editing?")) return;
                      cancelCardEdit();
                      setEditMode(true);
                    }
                  }}
                  title="Edit every aircraft at once. To change one aircraft, click it and press Edit on the card."
                >
                  {editMode ? "Editing all" : "Edit all"}
                </button>
              </div>
            ) : null}
          </div>
          ) : null}
        </div>

        {/* The headline number belongs to the view too. A big "6 open reqs" is a
            STAFFING number; above a training table it answers a question nobody
            on that tab asked. Training reports what it is actually about — how
            many are finished and waiting on a decision. */}
        <div className="right">
          {isTraining ? (
            <>
              <div className="kk" style={{ color: "var(--int-bd)" }}>
                Finished training
              </div>
              <div className="big">{finished.length}</div>
              <div className="kk" style={{ marginTop: 8 }}>
                {trainingCounts.active} active · {trainingCounts.archived} archived
              </div>
            </>
          ) : (
            <>
              <div className="kk" style={{ color: "var(--gold)" }}>
                Open reqs
              </div>
              <div className="big">{open}</div>
              <div className="kk" style={{ marginTop: 8 }}>
                {hiring} groups hiring
              </div>
            </>
          )}
        </div>
      </div>

      {findOpen && !isTraining ? (
        <PeopleIndex entries={indexEntries} unit="aircraft" onPick={(e) => showPerson(e.name, e.cardIdx)} onClose={() => setFindOpen(false)} />
      ) : null}

      {/* TRAINING IS OVER — ASK, DO NOT ACT. A pilot whose training end date has
          passed is still sitting in a training seat until somebody says
          otherwise, because training slips, is rescheduled, and is sometimes
          failed. This is the notification; the move is one confirmed click. */}
      {finished.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--gold, #eaaa00)",
            borderLeft: "4px solid var(--gold, #eaaa00)",
            borderRadius: 4,
            background: "var(--train-bg, rgba(234,170,0,.12))",
            padding: "10px 12px"
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {finished.length === 1 ? "1 pilot has finished training" : `${finished.length} pilots have finished training`}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
            Their training end date has passed but the chart still counts them as in training. Nobody is moved automatically.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {finished.map((p) => (
              <div key={`${p.name}-${p.gIdx}-${p.seatKey}`} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                <b>{p.name}</b>
                <span style={{ opacity: 0.8 }}>
                  {aircraftLabel(groupsData[p.gIdx])} · {SEAT_LABEL[p.seatKey]} · ended {p.end}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void moveTrainedToLine({ name: p.name, recordId: p.recordId, gIdx: p.gIdx, seatKey: p.seatKey, aircraft: aircraftLabel(groupsData[p.gIdx]) })}
                    disabled={saving}
                    style={{ background: "var(--navy, #0d2c43)", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
                  >
                    Move to the line
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => showPerson(p.name, p.gIdx)}
                  style={{ ...orgLinkBtnStyle, fontSize: 11.5 }}
                >
                  show on chart
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedTraining((prev) => [...prev, p.name])}
                  style={{ background: "none", border: "none", opacity: 0.65, fontSize: 11.5, cursor: "pointer", color: "inherit" }}
                  title="Hide until the next time this page is loaded"
                >
                  not yet
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {editMode ? (
        <div className="editbar">
          <div className="eb-msg">
            <b>Editing roster.</b> Click any aircraft to add or remove pilots, move them between aircraft, and open or close seats — or to <b>duplicate</b> it into another tail. Use <b>{dirty ? "Cancel" : "Done"}</b> to leave without changing anyone.
            {dirty ? (
              <span className="eb-dirty"> · unsaved changes</span>
            ) : (
              <span className="eb-clean"> · all changes saved</span>
            )}
            {saveErr ? <span className="eb-err"> · {saveErr}</span> : null}
          </div>
          <div className="eb-act">
            <button type="button" className="ghost" onClick={resetSeed} disabled={saving}>
              Reset to source
            </button>
            <button type="button" className="ghost" onClick={exitEdit} disabled={saving}>
              {dirty ? "Cancel" : "Done"}
            </button>
            <button type="button" className="primary" onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : null}

      {isTraining ? (
        <TrainingTab
          groups={groupsData}
          records={training}
          links={links}
          today={today}
          canEdit={canEdit}
          onChange={setTraining}
          onShowPerson={(name) => showPerson(name)}
        />
      ) : null}

      <div style={{ display: isTraining ? "none" : undefined }}>
      <div className="toptree">
        <div className="mgmt">
          <div className="mbox">
            <div className="t">{CREW_LEADERSHIP.assistants[0].name}</div>
            <div className="mr">{CREW_LEADERSHIP.assistants[0].role}</div>
          </div>
          <div className="chief">
            <div className="role">
              <div className="kk kkw">{CREW_LEADERSHIP.reportsTo}</div>
              <div className="r1">{CREW_LEADERSHIP.chiefRole}</div>
              <div className="kk kkw" style={{ marginTop: 7, letterSpacing: "0.06em" }}>
                {CREW_LEADERSHIP.chiefName}
              </div>
            </div>
            <div className="stats">
              <div>
                <div className="n">{filled}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Filled
                </div>
              </div>
              <div>
                <div className="n acc">{open}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Open
                </div>
              </div>
              <div>
                <div className="n">{target}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Target
                </div>
              </div>
              <div>
                <div className="n">{CREW_PILOT_TURNOVER.rate}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Turnover · {CREW_PILOT_TURNOVER.period}
                </div>
              </div>
            </div>
          </div>
          <div className="mbox">
            <div className="t">{CREW_LEADERSHIP.assistants[1].name}</div>
            <div className="mr">{CREW_LEADERSHIP.assistants[1].role}</div>
          </div>
        </div>
        <div className="vline" />
      </div>

      <Section title="Fractional / Charter Aircraft" list={ssG} bg="var(--band-fractional-bg)" fg="var(--band-fractional-fg)" />
      <div className="secgap" />
      <Section title="Managed / Dedicated Aircraft" list={mgG} bg="var(--band-managed-bg)" fg="var(--band-managed-fg)" />

      <div className="legend">
        <span className="kk" style={{ color: "var(--n600)" }}>
          Legend
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--fill-bg)" }} />
          Filled
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--train-bg)" }} />
          In training
        </span>
        <span className="it">
          <span className="sw" style={{ background: "transparent", border: "1.5px dashed var(--accent)" }} />
          Open req
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--cand-bg)", border: "1.5px solid var(--accent)" }} />
          Tentative · external
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--int-bg)", border: "1.5px solid var(--int-bd)" }} />
          Tentative · internal
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--park-bg)", border: "1px dashed var(--park-bd)" }} />
          Parked · not counted
        </span>
        <span className="it">
          <span className="ptag" style={{ marginLeft: 0 }}>+TYPE</span>
          Dual-qualified
        </span>
        <Link className="grow" href="/fleet/maintenance" style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
          Maintenance org chart →
        </Link>
      </div>
      <span className="mockflag">Live data · Paycom + fleet summary + Recruiting Status Tracking (Master + Training) + turnover dashboard — Jul 2026 · roster, open reqs, training, time-to-fill &amp; department turnover all sourced</span>
      </div>

      {/* The Training tab edits the SAME stored blob as the roster, so it needs
          its own Save — the chart-wide edit bar only appears during an "Edit
          all" session, and nobody enters one to type a date. */}
      {isTraining && canEdit ? (
        <div className="m-sect acts">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            style={{ background: dirty ? "var(--navy, #0d2c43)" : "transparent", color: dirty ? "#fff" : "var(--ink, #1a2b3c)", border: dirty ? "none" : "1px solid var(--line, #cdd7e2)", borderRadius: 4, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: saving || !dirty ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Save training"}
          </button>
          {saveErr ? (
            <span style={{ color: "#c0392b", fontSize: 12 }}>{saveErr}</span>
          ) : dirty ? (
            <span style={{ color: "#b0670e", fontSize: 12, fontWeight: 600 }}>Unsaved — nothing is stored until you save.</span>
          ) : (
            <span style={{ fontSize: 11.5, opacity: 0.65 }}>All changes saved.</span>
          )}
        </div>
      ) : null}

      <div className={`backdrop${active ? " open" : ""}`} onClick={closeModal} />
      <div className={`modal${active ? " open" : ""}`} role="dialog" aria-modal="true">
        {active && active.poolFlown ? (
          <>
            <div className="m-h">
              <button className="m-close" aria-label="Close" data-dialog-close onClick={closeModal}>
                ✕
              </button>
              <div className="m-ty">{active.name}</div>
              <div className="m-sub">{active.sub} · shared-pool tail</div>
            </div>
            <div className="m-move">
              <div className="m-empty">
                This managed tail has no dedicated crew — it is flown by the shared fractional PC-12 pool, so it carries no seats or open reqs of its own.
              </div>
            </div>
          </>
        ) : null}
        {active && !active.poolFlown && ap && acp ? (
          <>
            <div className="m-h">
              <button className="m-close" aria-label="Close" data-dialog-close onClick={closeModal}>
                ✕
              </button>
              <div className="m-ty">{active.name}</div>
              <div className="m-sub">
                {active.sub} · {acp.f}/{acp.at} captains
                {as && acs ? ` · ${acs.f}/${acs.at} first officers` : ""}
              </div>
              {/* Edit sits at the TOP now. It used to live below the seat lists,
                  the photo and the movement panel — on a full aircraft that is a
                  long scroll past everything you came to change.

                  GOLD, not navy: this header is navy, so a navy button on it was
                  invisible — it read as a line of text rather than the primary
                  action on the card. Gold on navy is the brand's own emphasis
                  pairing and is the one thing here that has to be found. */}
              {canEdit && !isEditing ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => startCardEdit(openIdx as number)}
                    style={{
                      background: "var(--gold, #eaaa00)",
                      color: "var(--navy, #0d2c43)",
                      border: "none",
                      borderRadius: 4,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: "0.02em",
                      cursor: "pointer",
                      boxShadow: "0 1px 3px rgba(0,0,0,.25)"
                    }}
                  >
                    Edit Crew
                  </button>
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>Changes here affect only {active.sub}.</span>
                </div>
              ) : null}
            </div>
            {isEditing ? (
              <>
                <div className="m-cols editing">
                  <EditCol
                    group={active}
                    gIdx={openIdx as number}
                    seatKey="pic"
                    label="Captains"
                    allGroups={groupsData}
                    movePick={movePick}
                    onAdd={(name, bucket, fillsNamed) => addPerson(openIdx as number, "pic", bucket, name, fillsNamed)}
                    onRemoveNamed={(label) => removeNamedOpening(openIdx as number, "pic", label)}
                    onRemove={(bucket, name) => removePerson(openIdx as number, "pic", bucket, name)}
                    onAdjustOpen={(delta) => adjustOpen(openIdx as number, "pic", delta)}
                    onToggleTrain={(name, toTrain) => toggleTrain(openIdx as number, "pic", name, toTrain)}
                    onSetMove={setMovePick}
                    onMove={doMove}
                    links={links}
                    onLink={linkPerson}
                    onUnlink={unlinkPerson}
                  />
                  <EditCol
                    group={active}
                    gIdx={openIdx as number}
                    seatKey="sic"
                    label="First Officers"
                    allGroups={groupsData}
                    movePick={movePick}
                    onAdd={(name, bucket, fillsNamed) => addPerson(openIdx as number, "sic", bucket, name, fillsNamed)}
                    onRemoveNamed={(label) => removeNamedOpening(openIdx as number, "sic", label)}
                    onRemove={(bucket, name) => removePerson(openIdx as number, "sic", bucket, name)}
                    onAdjustOpen={(delta) => adjustOpen(openIdx as number, "sic", delta)}
                    onToggleTrain={(name, toTrain) => toggleTrain(openIdx as number, "sic", name, toTrain)}
                    onSetMove={setMovePick}
                    onMove={doMove}
                    links={links}
                    onLink={linkPerson}
                    onUnlink={unlinkPerson}
                  />
                  {active.cabin ? (
                    <EditCol
                      group={active}
                      gIdx={openIdx as number}
                      seatKey="cabin"
                      label="Cabin"
                      allGroups={groupsData}
                      movePick={movePick}
                      onAdd={(name, bucket, fillsNamed) => addPerson(openIdx as number, "cabin", bucket, name, fillsNamed)}
                    onRemoveNamed={(label) => removeNamedOpening(openIdx as number, "cabin", label)}
                      onRemove={(bucket, name) => removePerson(openIdx as number, "cabin", bucket, name)}
                      onAdjustOpen={(delta) => adjustOpen(openIdx as number, "cabin", delta)}
                      onToggleTrain={(name, toTrain) => toggleTrain(openIdx as number, "cabin", name, toTrain)}
                      onSetMove={setMovePick}
                      onMove={doMove}
                      links={links}
                      onLink={linkPerson}
                      onUnlink={unlinkPerson}
                    />
                  ) : null}
                </div>
                {/* Edit mode shows EVERY departure, archived ones included —
                    this is the only place an archived row can be corrected or
                    deleted, so hiding them here would make archiving a one-way
                    door. */}
                {active.out && active.out.length ? (
                  <div className="ec-out">
                    <div className="ec-out-h">Transitioning out</div>
                    {active.out.map((o, i) => {
                      const gone = isDepartureArchived(o, today);
                      return (
                        <div className="ec-out-row" key={`${o.name}-${i}`} style={gone ? { opacity: 0.6 } : undefined}>
                          <span className="ec-out-nm">{o.name}</span>
                          <span className="ec-out-note">
                            {o.to ? `to ${o.to}` : ""}
                            {o.reason ? `${o.to ? " · " : ""}${o.reason}` : ""}
                            {gone ? " · archived" : ""}
                          </span>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                            <span style={{ opacity: 0.7 }}>left</span>
                            <input
                              type="date"
                              value={o.date ?? ""}
                              onChange={(e) => setOutDate(openIdx as number, i, e.target.value)}
                              title={`Date ${o.name} left. Departures drop out of the default view ${DEPARTURE_ARCHIVE_DAYS} days after this date; leave it blank and the row stays.`}
                              style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", background: "transparent", color: "inherit" }}
                            />
                          </label>
                          <button type="button" className="del" onClick={() => removeOut(openIdx as number, i)} title="Remove departure">
                            ✕
                          </button>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
                      A dated departure archives itself {DEPARTURE_ARCHIVE_DAYS} days later and stops showing on the card. Undated rows — including a tentative move — stay put.
                    </div>
                  </div>
                ) : null}
                <div className="m-edithint">
                  Changes are local until you press <b>{cardEditing ? "Save this aircraft" : "Save all changes"}</b> below. Adding a person fills an open seat; removing one reopens it. <b>Move</b> lets you pick where and how (on-line / training / tentative); a tentative move reopens the old seat and shows the pilot transitioning out here. Tentative — external (red) is an outside candidate; internal (blue) is a SkyShare employee moving in.
                </div>
              </>
            ) : (
              <>
                <div className="m-cols">
                  <div className="m-col">
                    <div className="colh">
                      <span>Captains</span>
                      <span>
                        {acp.f}/{acp.at}
                      </span>
                    </div>
                    <ColBody seat={active.pic} leadName={active.lead} showParked={showParked} tags={active.tags} links={links} highlight={highlight} trainingEnd={trainingEnds} />
                  </div>
                  <div className="m-col">
                    <div className="colh">
                      <span>First Officers</span>
                      <span>{as && acs ? `${acs.f}/${acs.at}` : "—"}</span>
                    </div>
                    <ColBody seat={active.sic} showParked={showParked} tags={active.tags} links={links} highlight={highlight} trainingEnd={trainingEnds} />
                  </div>
                  {acab && acabc ? (
                    <div className="m-cab">
                      <div className="colh">
                        <span>Cabin</span>
                        <span>
                          {acabc.f}/{acabc.at}
                        </span>
                      </div>
                      {acab.line.map((n, i) => (
                        <PersonRow
                          key={`cl${i}`}
                          name={n}
                          cls="g"
                          rp="On board"
                          href={links[n] ? `/candidates/${links[n]}` : undefined}
                          highlight={Boolean(highlight && n.toLowerCase() === highlight.toLowerCase())}
                        />
                      ))}
                      {acab.openNamed.map((l, i) => (
                        <SlotRow key={`co${i}`} label={l} cls="o" rp="To fill" />
                      ))}
                    </div>
                  ) : null}
                </div>
                <Transitions d={active} training={training} today={today} />
                <div className="m-photo">
                  {active.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={active.photo} alt={`${active.name} photo`} />
                  ) : (
                    <div className="ph">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="5" width="18" height="14" rx="1.5" />
                        <circle cx="8.5" cy="10" r="1.6" />
                        <path d="M4 17 l4.5-4.5 3 3 4-5 4.5 6" />
                      </svg>
                      <span>Aircraft photo</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : null}

        {/* A SHARED-POOL tail renders none of the seat columns, so it never
            reaches the Edit Crew button in the header above. It still needs one
            — this is how a pool tail gets duplicated or removed — so it keeps
            the bottom-of-card placement it always had. */}
        {active && active.poolFlown && canEdit && !isEditing ? (
          <div className="m-sect acts">
            <button
              type="button"
              onClick={() => startCardEdit(openIdx as number)}
              style={{ background: "var(--navy, #0d2c43)", color: "#fff", border: "none", borderRadius: 4, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Edit Crew
            </button>
            <span style={{ fontSize: 11.5, opacity: 0.65 }}>Changes here affect only {active.sub}.</span>
          </div>
        ) : null}

        {/* During an "Edit all" session the Save button lives in the header bar,
            which is off-screen while you are down in a card. Repeat it here so
            edits can be banked without hunting for it — the reported loss was
            exactly this: card after card edited, then away without saving. */}
        {active && editMode ? (
          <div className="m-sect acts">
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              style={{ background: dirty ? "var(--navy, #0d2c43)" : "transparent", color: dirty ? "#fff" : "var(--ink, #1a2b3c)", border: dirty ? "none" : "1px solid var(--line, #cdd7e2)", borderRadius: 4, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: saving || !dirty ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Saving…" : "Save all changes"}
            </button>
            {saveErr ? (
              <span style={{ color: "#c0392b", fontSize: 12 }}>{saveErr}</span>
            ) : dirty ? (
              <span style={{ color: "#b0670e", fontSize: 12, fontWeight: 600 }}>
                Unsaved — editing every aircraft. Nothing is stored until you save.
              </span>
            ) : (
              <span style={{ fontSize: 11.5, opacity: 0.65 }}>All changes saved.</span>
            )}
          </div>
        ) : null}

        {/* Save / Cancel for a single card. Absent during an "Edit all" session,
            where the chart-wide edit bar owns saving. */}
        {active && cardEditing ? (
          <div className="m-sect acts">
            <button
              type="button"
              onClick={() => void saveCardEdit()}
              disabled={saving || !cardDirty}
              style={{ background: "var(--navy, #0d2c43)", color: "#fff", border: "none", borderRadius: 4, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: saving || !cardDirty ? "default" : "pointer", opacity: saving || !cardDirty ? 0.5 : 1 }}
            >
              {saving ? "Saving…" : "Save this aircraft"}
            </button>
            <button
              type="button"
              onClick={cancelCardEdit}
              disabled={saving}
              style={{ background: "none", border: "none", color: "var(--ink, #1a2b3c)", opacity: 0.7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Cancel
            </button>
            {saveErr ? (
              <span style={{ color: "#c0392b", fontSize: 12 }}>{saveErr}</span>
            ) : (
              <span style={{ fontSize: 11.5, opacity: 0.65 }}>
                {cardDirty ? "Unsaved changes" : "No changes yet"} · a move also writes the aircraft the pilot goes to.
              </span>
            )}
          </div>
        ) : null}

        {active && isEditing ? (
          <div className="m-sect">
            {dupFrom === openIdx ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Copy this aircraft to a new tail</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                  The seat layout carries over as OPEN seats — pilots, tags and notes do not, since they belong to {active.sub}.
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <label style={{ flex: "1 1 130px" }}>
                    <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>Aircraft type</span>
                    <input
                      value={dupType}
                      onChange={(e) => setDupType(e.target.value)}
                      style={{ width: "100%", marginTop: 3, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", fontSize: 13 }}
                    />
                  </label>
                  <label style={{ flex: "1 1 110px" }}>
                    <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>Tail number</span>
                    <input
                      value={dupTail}
                      onChange={(e) => setDupTail(e.target.value)}
                      placeholder="N123AB"
                      style={{ width: "100%", marginTop: 3, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", fontSize: 13 }}
                    />
                  </label>
                  <label style={{ flex: "1 1 150px" }}>
                    <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>Owner / company</span>
                    <input
                      value={dupOwner}
                      onChange={(e) => setDupOwner(e.target.value)}
                      style={{ width: "100%", marginTop: 3, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", fontSize: 13 }}
                    />
                  </label>
                </div>
                {dupErr ? <div style={{ color: "#c0392b", fontSize: 12, marginTop: 8 }}>{dupErr}</div> : null}
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={duplicateGroup}
                    style={{ background: "var(--navy, #0d2c43)", color: "#fff", border: "none", borderRadius: 4, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    Add this tail
                  </button>
                  <button
                    type="button"
                    onClick={() => setDupFrom(null)}
                    style={{ background: "none", border: "none", color: "var(--ink, #1a2b3c)", opacity: 0.7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <span style={{ fontSize: 11.5, opacity: 0.65 }}>Nothing is stored until you press Save changes.</span>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => startDuplicate(openIdx as number)}
                  style={{ ...orgLinkBtnStyle, fontSize: 12.5, fontWeight: 600, padding: "5px 10px" }}
                >
                  Duplicate this aircraft
                </button>
                <button
                  type="button"
                  onClick={() => removeGroup(openIdx as number)}
                  style={{ background: "none", border: "none", color: "#c0392b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 2px" }}
                >
                  Remove this aircraft
                </button>
                <span style={{ fontSize: 11.5, opacity: 0.65 }}>Use Duplicate to add another managed tail of the same type.</span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {roleDone && (
        <div style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 80, background: "var(--navy, #0d2c43)", color: "#fff", padding: "10px 16px", borderRadius: 6, fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,.25)", display: "flex", gap: 12, alignItems: "center" }}>
          <span>{roleDone}</span>
          <button onClick={() => setRoleDone(null)} style={{ color: "#fff", opacity: 0.8, background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>
            Dismiss
          </button>
        </div>
      )}

      {rolePrompt && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 78, background: "rgba(13,44,67,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setRolePrompt(null)}
        >
          <div
            style={{ width: "100%", maxWidth: 380, background: "var(--card, #fff)", color: "var(--ink, #1a2b3c)", borderRadius: 8, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700 }}>Record this move on {rolePrompt.name}&apos;s journey?</div>
            <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 4 }}>
              {rolePrompt.name} is linked to an employee — this adds a role change to their journey. The chart move alone does not.
            </div>
            <div style={{ fontSize: 13, margin: "10px 0", fontWeight: 600 }}>
              {rolePrompt.currentTitle ?? "Current role"} → {roleTitle || "…"}
            </div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>New role title</label>
            <input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              style={{ width: "100%", marginTop: 3, marginBottom: 8, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>Effective date</span>
                <input
                  type="date"
                  value={roleDate}
                  onChange={(e) => setRoleDate(e.target.value)}
                  style={{ width: "100%", marginTop: 3, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", fontSize: 13 }}
                />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>Transition</span>
                <select
                  value={roleType}
                  onChange={(e) => setRoleType(e.target.value)}
                  style={{ width: "100%", marginTop: 3, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", fontSize: 13 }}
                >
                  <option value="TRANSFER">Transfer</option>
                  <option value="LATERAL">Lateral move</option>
                  <option value="PROMOTION">Promotion</option>
                  <option value="UPGRADE">Upgrade (→ Captain)</option>
                </select>
              </label>
            </div>
            {roleErr && <div style={{ color: "#c0392b", fontSize: 12, marginTop: 8 }}>{roleErr}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                onClick={() => void recordRoleChange()}
                disabled={roleBusy}
                style={{ background: "var(--navy, #0d2c43)", color: "#fff", border: "none", borderRadius: 4, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: roleBusy ? 0.6 : 1 }}
              >
                {roleBusy ? "Recording…" : "Record role change"}
              </button>
              <button
                onClick={() => setRolePrompt(null)}
                disabled={roleBusy}
                style={{ background: "none", border: "none", color: "var(--ink, #1a2b3c)", opacity: 0.7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
