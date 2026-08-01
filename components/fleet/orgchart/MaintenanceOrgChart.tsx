"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { MxGroup, MxSection, Seat } from "@/lib/fleet/staffing/types";
import { normSeat, cntSeat } from "@/lib/fleet/staffing/compute";
import { MX_DIRECTOR, MX_TURNOVER } from "@/lib/fleet/staffing/maintenance-data";
import { SeatSquares, PersonRow, SlotRow } from "./SeatParts";
import { LinkPicker, orgLinkBtnStyle as linkBtnStyle } from "./LinkPicker";
import { PeopleIndex, type IndexEntry } from "./PeopleIndex";
import { useUnsavedGuard } from "./useUnsavedGuard";
import styles from "./OrgChart.module.css";

type SortKey = "Team size" | "Open seats";

// --- edit-mode helpers (a maintenance section is a Seat + label) ------------
type FillBucket = "line" | "train" | "cand" | "candInt" | "offered";
const MX_STATUS: { value: FillBucket; label: string }[] = [
  { value: "line", label: "On staff" },
  { value: "train", label: "In training" },
  { value: "cand", label: "Candidate" },
  { value: "candInt", label: "Candidate · internal" },
  { value: "offered", label: "Offered" }
];
const MX_DOT: Record<FillBucket, string> = { line: "g", train: "t", cand: "r", candInt: "i", offered: "of" };

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

type MoveDest = { gIdx: number; sIdx: number; label: string };

/** One editable maintenance section in the edit-mode modal. Module-scoped so the
    "add name" input keeps focus across the parent's re-renders. */
function MxEditSection({
  sec,
  onAdd,
  onRemove,
  onSetStatus,
  onAdjustOpen,
  moveDests,
  onMove,
  links,
  onLink,
  onUnlink
}: {
  sec: MxSection;
  onAdd: (name: string, bucket: FillBucket) => void;
  onRemove: (bucket: FillBucket, name: string) => void;
  onSetStatus: (from: FillBucket, to: FillBucket, name: string) => void;
  onAdjustOpen: (delta: number) => void;
  /** Every other section this person could move to. */
  moveDests: MoveDest[];
  onMove: (bucket: FillBucket, name: string, dest: { gIdx: number; sIdx: number }, arrive: FillBucket) => void;
  links: Record<string, string>;
  onLink: (name: string, candidateId: string) => void;
  onUnlink: (name: string) => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftBucket, setDraftBucket] = useState<FillBucket>("cand");
  // Which person has an action panel open, and which one.
  const [action, setAction] = useState<{ name: string; kind: "move" | "link" } | null>(null);
  const [moveDest, setMoveDest] = useState("");
  const [moveArrive, setMoveArrive] = useState<FillBucket>("cand");
  const o = normSeat(sec);
  const filled = o.line.length + o.train.length;
  const total = filled + o.open + o.openNamed.length + o.cand.length + o.candInt.length + o.offered.length;
  const rows: { name: string; bucket: FillBucket }[] = [
    ...o.line.map((n) => ({ name: n, bucket: "line" as FillBucket })),
    ...o.train.map((n) => ({ name: n, bucket: "train" as FillBucket })),
    ...o.offered.map((n) => ({ name: n, bucket: "offered" as FillBucket })),
    ...o.cand.map((n) => ({ name: n, bucket: "cand" as FillBucket })),
    ...o.candInt.map((n) => ({ name: n, bucket: "candInt" as FillBucket }))
  ];
  return (
    <div className="m-col ec">
      <div className="colh">
        <span>{sec.label}</span>
        <span>
          {filled}/{total}
        </span>
      </div>
      {rows.map((r) => {
        const linkedId = links[r.name];
        const isMove = action?.name === r.name && action.kind === "move";
        const isLink = action?.name === r.name && action.kind === "link";
        return (
          <div className={`ec-row ${r.bucket === "offered" ? "of" : ""}`} key={`${r.bucket}-${r.name}`}>
            <div className="ec-line">
              <span className={`ec-dot ${MX_DOT[r.bucket]}`} />
              <span className="ec-nm">
                {linkedId ? (
                  <Link href={`/candidates/${linkedId}`} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </span>
              <span className="ec-act">
                <select
                  className="ec-status"
                  value={r.bucket}
                  onChange={(e) => onSetStatus(r.bucket, e.target.value as FillBucket, r.name)}
                  aria-label={`Status for ${r.name}`}
                >
                  {MX_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {moveDests.length > 0 && (
                  <button
                    type="button"
                    style={linkBtnStyle}
                    title="Move to another location"
                    onClick={() => {
                      setMoveDest("");
                      setMoveArrive(r.bucket);
                      setAction(isMove ? null : { name: r.name, kind: "move" });
                    }}
                  >
                    move
                  </button>
                )}
                <button
                  type="button"
                  style={{ ...linkBtnStyle, borderColor: linkedId ? "var(--green, #2e7d32)" : undefined, color: linkedId ? "var(--green, #2e7d32)" : undefined }}
                  title={linkedId ? "Linked to a candidate profile" : "Link to a candidate profile"}
                  onClick={() => setAction(isLink ? null : { name: r.name, kind: "link" })}
                >
                  {linkedId ? "linked" : "link"}
                </button>
                <button type="button" className="del" onClick={() => onRemove(r.bucket, r.name)} title="Remove">
                  ✕
                </button>
              </span>
            </div>

            {isMove && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, alignItems: "center" }}>
                <select
                  value={moveDest}
                  onChange={(e) => setMoveDest(e.target.value)}
                  aria-label={`Move ${r.name} to`}
                  style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)" }}
                >
                  <option value="">Move to…</option>
                  {moveDests.map((d) => (
                    <option key={`${d.gIdx}|${d.sIdx}`} value={`${d.gIdx}|${d.sIdx}`}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <select
                  value={moveArrive}
                  onChange={(e) => setMoveArrive(e.target.value as FillBucket)}
                  aria-label="Arrival status"
                  style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)" }}
                >
                  {MX_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  style={linkBtnStyle}
                  disabled={!moveDest}
                  onClick={() => {
                    const [gi, si] = moveDest.split("|");
                    onMove(r.bucket, r.name, { gIdx: Number(gi), sIdx: Number(si) }, moveArrive);
                    setAction(null);
                  }}
                >
                  Move
                </button>
              </div>
            )}

            {isLink && (
              <div style={{ marginTop: 4 }}>
                {linkedId && (
                  <button type="button" style={{ ...linkBtnStyle, marginBottom: 4 }} onClick={() => { onUnlink(r.name); setAction(null); }}>
                    Unlink from current candidate
                  </button>
                )}
                <LinkPicker
                  initialQuery={r.name}
                  onPick={(candidateId) => {
                    onLink(r.name, candidateId);
                    setAction(null);
                  }}
                  onCancel={() => setAction(null)}
                />
              </div>
            )}
          </div>
        );
      })}
      {o.openNamed.map((l, i) => (
        <div className="ec-named" key={`on${i}`}>
          {l} · <span>named opening</span>
        </div>
      ))}
      <div className="ec-open">
        <span>Open positions</span>
        <button type="button" onClick={() => onAdjustOpen(-1)} disabled={o.open === 0} aria-label="Remove an open position">
          −
        </button>
        <b>{o.open}</b>
        <button type="button" onClick={() => onAdjustOpen(1)} aria-label="Add an open position">
          +
        </button>
      </div>
      <form
        className="ec-add"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(draftName, draftBucket);
          setDraftName("");
        }}
      >
        <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Add name…" />
        <select value={draftBucket} onChange={(e) => setDraftBucket(e.target.value as FillBucket)} aria-label="How to add this person">
          {MX_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!draftName.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

function groupTotals(d: MxGroup) {
  let f = 0;
  let tr = 0;
  let o = 0;
  let at = 0;
  let p = 0;
  d.sections.forEach((sec) => {
    const c = cntSeat(normSeat(sec));
    f += c.f;
    tr += c.tr;
    o += c.o;
    at += c.at;
    p += c.p;
  });
  return { f, tr, o, at, p };
}

function SectionCol({ sec, links = {}, highlight }: { sec: MxSection; links?: Record<string, string>; highlight?: string | null }) {
  const o = normSeat(sec);
  const c = cntSeat(o);
  const href = (n: string) => (links[n] ? `/candidates/${links[n]}` : undefined);
  const hl = (n: string) => Boolean(highlight && n.toLowerCase() === highlight.toLowerCase());
  const rows: ReactNode[] = [];
  o.line.forEach((n, i) => rows.push(<PersonRow key={`l${i}`} name={n} cls="g" rp="On staff" href={href(n)} highlight={hl(n)} />));
  o.train.forEach((n, i) => rows.push(<PersonRow key={`t${i}`} name={n} cls="t" rp="In training" href={href(n)} highlight={hl(n)} />));
  o.offered.forEach((n, i) => rows.push(<PersonRow key={`of${i}`} name={n} cls="of" rp="Offered" href={href(n)} highlight={hl(n)} />));
  o.cand.forEach((n, i) => rows.push(<PersonRow key={`c${i}`} name={n} cls="r" rp="Candidate" href={href(n)} highlight={hl(n)} />));
  o.candInt.forEach((n, i) => rows.push(<PersonRow key={`ci${i}`} name={n} cls="i" rp="Candidate · internal" href={href(n)} highlight={hl(n)} />));
  o.openNamed.forEach((lbl, i) => rows.push(<SlotRow key={`on${i}`} label={lbl} cls="o" rp="To fill" />));
  for (let i = 0; i < o.open; i++) rows.push(<SlotRow key={`o${i}`} label="Open position" cls="o" rp="Sourcing" />);
  return (
    <div className="m-col">
      <div className="colh">
        <span>{sec.label}</span>
        <span>
          {c.f + c.tr}/{c.at}
        </span>
      </div>
      {rows}
    </div>
  );
}

function Pipeline({ d }: { d: MxGroup }) {
  const inn: { name: string; note: string }[] = [];
  const open: { name: string; note: string }[] = [];
  d.sections.forEach((sec) => {
    const shift = sec.label.split("·")[0].trim();
    (sec.offered || []).forEach((n) => inn.push({ name: n, note: `${shift} · offered` }));
    (sec.cand || []).forEach((n) => inn.push({ name: n, note: `${shift} · candidate` }));
    (sec.train || []).forEach((n) => inn.push({ name: n, note: `${shift} · in training` }));
    (sec.openNamed || []).forEach((lbl) => open.push({ name: lbl, note: "to fill" }));
    for (let i = 0; i < (sec.open || 0); i++) open.push({ name: `Open ${shift} req`, note: "sourcing" });
  });
  const block = (title: string, cls: string, arr: { name: string; note: string }[]) => (
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
    </div>
  );
  return (
    <div className="m-move">
      <div className="mh4">Hiring pipeline</div>
      <div className="mgrid">
        {block("In progress", "inn", inn)}
        {block("Unfilled reqs", "outt", open)}
      </div>
    </div>
  );
}

export default function MaintenanceOrgChart({
  initialGroups,
  initialLinks,
  canEdit = false
}: {
  initialGroups?: MxGroup[];
  initialLinks?: Record<string, string>;
  canEdit?: boolean;
} = {}) {
  const [sort, setSort] = useState<SortKey>("Team size");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // "Find a person" — same need as the crew chart: this chart is organised by
  // LOCATION, so finding a named technician means opening cards until they turn
  // up. See PeopleIndex.
  const [findOpen, setFindOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const [mxData, setMxData] = useState<MxGroup[]>(() => initialGroups ?? []);
  const [savedGroups, setSavedGroups] = useState<MxGroup[]>(() => initialGroups ?? []);
  // name -> candidateId, edited alongside the roster and saved with it.
  const [links, setLinks] = useState<Record<string, string>>(() => initialLinks ?? {});
  const [savedLinks, setSavedLinks] = useState<Record<string, string>>(() => initialLinks ?? {});
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // Per-card editing: the group index open for editing, plus the roster as it
  // stood when that editor opened (what Cancel restores).
  const [cardEdit, setCardEdit] = useState<number | null>(null);
  const [cardSnapshot, setCardSnapshot] = useState<{ groups: MxGroup[]; links: Record<string, string> } | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(mxData) !== JSON.stringify(savedGroups) || JSON.stringify(links) !== JSON.stringify(savedLinks),
    [mxData, savedGroups, links, savedLinks]
  );
  /** Changed since THIS card editor opened — separate from chart-wide `dirty`. */
  const cardDirty = useMemo(
    () =>
      cardSnapshot !== null &&
      (JSON.stringify(mxData) !== JSON.stringify(cardSnapshot.groups) ||
        JSON.stringify(links) !== JSON.stringify(cardSnapshot.links)),
    [mxData, links, cardSnapshot]
  );

  const applyEdit = (fn: (draft: MxGroup[]) => void) =>
    setMxData((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
  const sectionOf = (d: MxGroup[], gIdx: number, sIdx: number) => d[gIdx].sections[sIdx];
  const addPerson = (gIdx: number, sIdx: number, bucket: FillBucket, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    applyEdit((d) => {
      const s = sectionOf(d, gIdx, sIdx);
      push(s, bucket, clean);
      if ((s.open ?? 0) > 0) {
        const n = (s.open ?? 0) - 1;
        if (n === 0) delete s.open;
        else s.open = n;
      }
    });
  };
  const removePerson = (gIdx: number, sIdx: number, bucket: FillBucket, name: string) =>
    applyEdit((d) => {
      const s = sectionOf(d, gIdx, sIdx);
      pull(s, bucket, name);
      // removing a person reopens the position (a backfill req)
      s.open = (s.open ?? 0) + 1;
    });
  const setStatus = (gIdx: number, sIdx: number, from: FillBucket, to: FillBucket, name: string) => {
    if (from === to) return;
    // a pure status change (e.g. Candidate → In training): move between buckets,
    // don't touch the open count (the person already occupied the slot).
    applyEdit((d) => {
      const s = sectionOf(d, gIdx, sIdx);
      pull(s, from, name);
      push(s, to, name);
    });
  };
  const adjustOpen = (gIdx: number, sIdx: number, delta: number) =>
    applyEdit((d) => {
      const s = sectionOf(d, gIdx, sIdx);
      const n = Math.max(0, (s.open ?? 0) + delta);
      if (n === 0) delete s.open;
      else s.open = n;
    });

  // Move a person from one section to another: pull them from the source (which
  // reopens the seat they left, a backfill req), and drop them into the
  // destination bucket (consuming an open seat there if one exists). This is the
  // maintenance equivalent of the pilot chart's cross-aircraft move.
  const movePerson = (
    fromGIdx: number,
    fromSIdx: number,
    fromBucket: FillBucket,
    name: string,
    dest: { gIdx: number; sIdx: number },
    arrive: FillBucket
  ) =>
    applyEdit((d) => {
      const src = sectionOf(d, fromGIdx, fromSIdx);
      pull(src, fromBucket, name);
      src.open = (src.open ?? 0) + 1;
      const dst = sectionOf(d, dest.gIdx, dest.sIdx);
      push(dst, arrive, name);
      if ((dst.open ?? 0) > 0) {
        const n = (dst.open ?? 0) - 1;
        if (n === 0) delete dst.open;
        else dst.open = n;
      }
    });

  // Every section a person could move TO, excluding the one they are in.
  const moveDestsExcluding = (gIdx: number, sIdx: number): MoveDest[] => {
    const out: MoveDest[] = [];
    mxData.forEach((g, gi) =>
      g.sections.forEach((s, si) => {
        if (gi === gIdx && si === sIdx) return;
        out.push({ gIdx: gi, sIdx: si, label: `${g.name} · ${s.label}` });
      })
    );
    return out;
  };

  const linkPerson = (name: string, candidateId: string) => setLinks((prev) => ({ ...prev, [name]: candidateId }));
  const unlinkPerson = (name: string) =>
    setLinks((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const postRoster = async (body: unknown): Promise<boolean> => {
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch("/api/workspace-settings/fleet-mx-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { groups: MxGroup[]; links?: Record<string, string> };
      setMxData(data.groups);
      setSavedGroups(data.groups);
      const nextLinks = data.links ?? {};
      setLinks(nextLinks);
      setSavedLinks(nextLinks);
      return true;
    } catch {
      setSaveErr("Couldn't save — check your connection or that you're signed in as an admin.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const save = () => void postRoster({ groups: mxData, links });
  const resetSeed = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset the maintenance chart to the original source data? This discards all saved manual edits.")) return;
    void postRoster({ reset: true });
  };
  // ALWAYS confirm when there is something to lose: this button is one click
  // from discarding a whole "Edit all" pass, and it did exactly that to someone.
  const exitEdit = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this chart? Everything you have edited since the last save will be lost.")) return;
    setMxData(savedGroups);
    setLinks(savedLinks);
    setSaveErr(null);
    setEditMode(false);
  };

  // --- per-card editing ----------------------------------------------------
  // Mirrors the crew chart: click the location you want to change and edit it
  // there. Cancel restores a snapshot rather than one group by index, because a
  // cross-location move deliberately touches two groups.
  const startCardEdit = (idx: number) => {
    setCardSnapshot({ groups: structuredClone(mxData), links: { ...links } });
    setCardEdit(idx);
    setSaveErr(null);
  };
  const cancelCardEdit = () => {
    if (cardSnapshot) {
      setMxData(cardSnapshot.groups);
      setLinks(cardSnapshot.links);
    }
    setCardSnapshot(null);
    setCardEdit(null);
    setSaveErr(null);
  };
  const saveCardEdit = async () => {
    const ok = await postRoster({ groups: mxData, links });
    if (!ok) return; // leave the editor open so the changes aren't lost
    setCardSnapshot(null);
    setCardEdit(null);
  };
  /** Open a card, guarding unsaved work on the one being left. */
  const openCard = (idx: number) => {
    if (cardEdit !== null && cardEdit !== idx) {
      if (cardDirty && !window.confirm("Discard the unsaved changes to the location you were editing?")) return;
      cancelCardEdit();
    }
    setOpenIdx(idx);
  };
  const closeModal = () => {
    if (cardEdit !== null && cardDirty) {
      if (!window.confirm("Discard the unsaved changes to this location?")) return;
      cancelCardEdit();
    } else if (cardEdit !== null) {
      cancelCardEdit();
    }
    setOpenIdx(null);
    setHighlight(null);
  };

  /** Everyone on the chart, flattened, for the "Find a person" panel. Built
      from mxData so it is independent of the card sort and of any filtering. */
  const indexEntries = useMemo<IndexEntry[]>(() => {
    const out: IndexEntry[] = [];
    const BUCKETS: { key: FillBucket; tone: IndexEntry["tone"]; word: string }[] = [
      { key: "line", tone: "g", word: "on staff" },
      { key: "train", tone: "t", word: "in training" },
      { key: "offered", tone: "of", word: "offered" },
      { key: "cand", tone: "r", word: "candidate · external" },
      { key: "candInt", tone: "i", word: "candidate · internal" }
    ];
    mxData.forEach((g, gIdx) => {
      g.sections.forEach((sec) => {
        const seat = normSeat(sec);
        BUCKETS.forEach(({ key, tone, word }) => {
          seat[key].forEach((name) => {
            out.push({
              name,
              where: g.name,
              role: `${sec.label} · ${word}`,
              tone,
              cardIdx: gIdx,
              ...(links[name] ? { candidateId: links[name] } : {})
            });
          });
        });
      });
    });
    return out;
  }, [mxData, links]);

  const showPerson = (entry: IndexEntry) => {
    setFindOpen(false);
    setHighlight(entry.name);
    openCard(entry.cardIdx);
  };

  const groups = mxData.map((d, idx) => {
    const t = groupTotals(d);
    let status = "STAFFED";
    let bBg = "var(--fill-soft)";
    let bFg = "var(--fill-fg)";
    let rule = "var(--green)";
    if (t.o > 0) {
      status = "HIRING";
      bBg = "var(--open-soft-bg)";
      bFg = "var(--open-soft-fg)";
      rule = "var(--accent)";
    } else if (t.tr > 0) {
      status = "TRAINING";
      bBg = "var(--train-bg)";
      bFg = "var(--train-fg)";
      rule = "var(--gold)";
    }
    return { d, idx, t, status, bBg, bFg, rule };
  });

  const filled = groups.reduce((a, g) => a + g.t.f + g.t.tr, 0);
  const open = groups.reduce((a, g) => a + g.t.o, 0);
  const target = groups.reduce((a, g) => a + g.t.at, 0);
  const hiring = groups.filter((g) => g.t.o > 0).length;

  // Card heights are equalized purely in CSS now (the grid stretches each row —
  // see .grid/.card in OrgChart.module.css). The old JS pass that measured and set
  // minHeight raced the web-font load and left cards uneven until a manual refresh.

  useUnsavedGuard(dirty, "You have unsaved changes to the maintenance chart. Leave this page and lose them?");

  // Routed through a ref because closeModal now checks for unsaved card edits,
  // and this listener is bound once.
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
    if (sort === "Open seats") a.sort((x, y) => y.t.o - x.t.o);
    return a;
  };

  const Card = ({ g }: { g: G }) => {
    const barCls = g.t.o > 0 ? "r" : g.t.tr > 0 ? "y" : "g";
    const barWord = g.t.o > 0 ? "Hiring" : g.t.tr > 0 ? "Training" : "Staffed";
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
              {g.t.f + g.t.tr} of {g.t.at} staffed
            </span>
          </div>
          <div className="bd">
            {g.d.sections.map((sec, i) => {
              const c = cntSeat(normSeat(sec));
              return (
                <div className="row" key={i}>
                  <div className="kk">
                    {sec.label} ·{" "}
                    <span className={`cnt${c.o >= 2 ? " alert" : ""}`}>
                      <b>{c.f + c.tr}</b>/{c.at}
                    </span>
                  </div>
                  <SeatSquares seat={sec} showParked={false} />
                </div>
              );
            })}
          </div>
          <div className="foot">
            <span className="kk" style={{ color: "inherit", opacity: 0.85 }}>
              Open reqs
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="taphint" style={{ color: "var(--n400)" }}>
                view team
              </span>
              <span className="n">{g.t.o}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ title, list, bg, fg }: { title: string; list: G[]; bg: string; fg: string }) => {
    const f = list.reduce((n, g) => n + g.t.f + g.t.tr, 0);
    const t = list.reduce((n, g) => n + g.t.at, 0);
    const op = list.reduce((n, g) => n + g.t.o, 0);
    return (
      <>
        <div className="divband" style={{ background: bg, color: fg }}>
          <div className="divtitle">{title}</div>
          <div className="divinline">
            {f}/{t} filled · <b>{op}</b> open
          </div>
        </div>
        <div className="grid g4">
          {sortG(list).map((g) => (
            <Card key={g.idx} g={g} />
          ))}
        </div>
      </>
    );
  };

  const lineG = groups.filter((g) => g.d.pool === "Line");
  const admG = groups.filter((g) => g.d.pool === "Admin");

  const active = openIdx != null ? mxData[openIdx] : null;
  const at = active ? groupTotals(active) : null;
  // The open card is editable either because this one card is being edited, or
  // because the whole chart is in the bulk "Edit all" session.
  const cardEditing = cardEdit !== null && cardEdit === openIdx;
  const isEditing = editMode || cardEditing;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className="hd">
        <div>
          <div className="kk" style={{ color: "var(--gold)" }}>
            SkyShare · Maintenance
          </div>
          <div className="ttl">Maintenance Org Chart</div>
          <div className="desc">
            Maintenance staffing across the maintenance teams and the administrative group.{" "}
            <b>Click any group to see its people{canEdit ? " — and to edit that group" : ""}.</b> Candidates and unfilled lead roles count as open positions until they start.
          </div>
          <div className="ctrls">
            <div className="seg">
              <span className="lbl">People</span>
              <button className={findOpen ? "on" : ""} onClick={() => setFindOpen((v) => !v)}>
                {findOpen ? "Close list" : "Find a person"}
              </button>
            </div>
            <div className="seg">
              <span className="lbl">Sort</span>
              <button className={sort === "Team size" ? "on" : ""} onClick={() => setSort("Team size")}>
                Team size
              </button>
              <button className={sort === "Open seats" ? "on" : ""} onClick={() => setSort("Open seats")}>
                Open seats
              </button>
            </div>
            {/* Editing is per card now — click a location and edit it there.
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
                      if (cardEdit !== null && cardDirty && !window.confirm("Discard the unsaved changes to the location you were editing?")) return;
                      cancelCardEdit();
                      setEditMode(true);
                    }
                  }}
                  title="Edit every location at once. To change one location, click it and press Edit on the card."
                >
                  {editMode ? "Editing all" : "Edit all"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="right">
          <div className="kk" style={{ color: "var(--gold)" }}>
            Open positions
          </div>
          <div className="big">{open}</div>
          <div className="kk" style={{ marginTop: 8 }}>
            {hiring} groups hiring
          </div>
        </div>
      </div>

      {findOpen ? (
        <PeopleIndex entries={indexEntries} unit="location" onPick={showPerson} onClose={() => setFindOpen(false)} />
      ) : null}

      {editMode ? (
        <div className="editbar">
          <div className="eb-msg">
            <b>Editing roster.</b> Click any group to change a person&apos;s status, add or remove people, and open or close positions. Use <b>{dirty ? "Cancel" : "Done"}</b> to leave without changing anyone.
            {dirty ? <span className="eb-dirty"> · unsaved changes</span> : <span className="eb-clean"> · all changes saved</span>}
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

      <div className="toptree">
        <div className="mgmt">
          <div className="chief">
            <div className="role">
              <div className="kk kkw">{MX_DIRECTOR.org}</div>
              <div className="r1">{MX_DIRECTOR.role}</div>
              <div className="kk kkw" style={{ marginTop: 7, letterSpacing: "0.06em" }}>
                {MX_DIRECTOR.name}
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
                <div className="n">{MX_TURNOVER.rate}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Turnover · {MX_TURNOVER.period}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="vline" />
      </div>

      <Section title="Maintenance" list={lineG} bg="var(--band-fractional-bg)" fg="var(--band-fractional-fg)" />
      <div className="secgap" />
      <Section title="Administrative" list={admG} bg="var(--band-managed-bg)" fg="var(--band-managed-fg)" />

      <div className="legend">
        <span className="kk" style={{ color: "var(--n600)" }}>
          Legend
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--fill-bg)" }} />
          On staff
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--cand-bg)", border: "1.5px solid var(--accent)" }} />
          Candidate · external
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--int-bg)", border: "1.5px solid var(--int-bd)" }} />
          Candidate · internal
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--train-bg)" }} />
          In training
        </span>
        <span className="it">
          <span className="sw" style={{ background: "transparent", border: "1.5px dashed var(--accent)" }} />
          Open req
        </span>
        <Link className="grow" href="/fleet/crew" style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
          Crew org chart →
        </Link>
      </div>
      {/* It said "Seed data", which stopped being true when this chart became
          admin-editable — edits are stored in a WorkspaceSetting (fleet/mx-roster),
          exactly like the crew chart, which has always said "Live data". Calling
          real, editable data a mockup tells people not to trust it, which is the
          opposite of what a chart nobody has adopted yet needs. */}
      <span className="mockflag">Live data · current MX roster + active candidates · admin-edited on this page · candidates count as open until start date</span>

      <div className={`backdrop${active ? " open" : ""}`} onClick={closeModal} />
      <div className={`modal${active ? " open" : ""}`} role="dialog" aria-modal="true">
        {active && at ? (
          <>
            <div className="m-h">
              <button className="m-close" aria-label="Close" data-dialog-close onClick={closeModal}>
                ✕
              </button>
              <div className="m-ty">{active.name}</div>
              <div className="m-sub">
                {active.sub} · {at.f}/{at.at} staffed · reports to {active.mgr}
              </div>
              {/* Edit at the TOP, matching the crew chart — it used to sit below
                  every section and the hiring pipeline. Gold on the navy header
                  for the same reason: a navy button on a navy bar disappears. */}
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
                    Edit Team
                  </button>
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>Changes here affect only {active.name}.</span>
                </div>
              ) : null}
            </div>
            {isEditing ? (
              <>
                <div className="m-cols editing">
                  {active.sections.map((sec, i) => (
                    <MxEditSection
                      key={i}
                      sec={sec}
                      onAdd={(name, bucket) => addPerson(openIdx as number, i, bucket, name)}
                      onRemove={(bucket, name) => removePerson(openIdx as number, i, bucket, name)}
                      onSetStatus={(from, to, name) => setStatus(openIdx as number, i, from, to, name)}
                      onAdjustOpen={(delta) => adjustOpen(openIdx as number, i, delta)}
                      moveDests={moveDestsExcluding(openIdx as number, i)}
                      onMove={(bucket, name, dest, arrive) => movePerson(openIdx as number, i, bucket, name, dest, arrive)}
                      links={links}
                      onLink={linkPerson}
                      onUnlink={unlinkPerson}
                    />
                  ))}
                </div>
                <div className="m-edithint">
                  Changes are local until you press <b>{cardEditing ? "Save this location" : "Save all changes"}</b> below. Use each person&apos;s status dropdown to change them (e.g. <b>Candidate → In training</b>). Adding a person fills an open position; removing one reopens it. Candidate = red (external), Candidate · internal = blue.
                </div>
              </>
            ) : (
              <>
                <div className="m-cols">
                  {active.sections.map((sec, i) => (
                    <SectionCol key={i} sec={sec} links={links} highlight={highlight} />
                  ))}
                </div>
                <Pipeline d={active} />
              </>
            )}
          </>
        ) : null}

        {/* Per-card edit entry point, and its own Save / Cancel.

            NO "Duplicate this location" here, deliberately. The crew chart has
            Duplicate/Remove for aircraft; this chart was left without it BY
            REQUEST on 2026-07-22 — a new managed tail is a routine arrival, a
            new maintenance line station is not. It is a decision, not a gap, so
            please don't add it purely to make the two charts match the standing
            "every chart ships the same capabilities" rule. If maintenance ever
            genuinely needs a new location, build it then.

            The Edit entry point itself now lives in the card HEADER (above),
            not here — it was below every section and the hiring pipeline, which
            on a full location is a long scroll past the thing you came to
            change. */}

        {/* During an "Edit all" session the Save button lives in the header bar,
            off-screen while you are down in a card. Repeat it here so edits can
            be banked without hunting for it. */}
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
                Unsaved — editing every location. Nothing is stored until you save.
              </span>
            ) : (
              <span style={{ fontSize: 11.5, opacity: 0.65 }}>All changes saved.</span>
            )}
          </div>
        ) : null}

        {active && cardEditing ? (
          <div className="m-sect acts">
            <button
              type="button"
              onClick={() => void saveCardEdit()}
              disabled={saving || !cardDirty}
              style={{ background: "var(--navy, #0d2c43)", color: "#fff", border: "none", borderRadius: 4, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: saving || !cardDirty ? "default" : "pointer", opacity: saving || !cardDirty ? 0.5 : 1 }}
            >
              {saving ? "Saving…" : "Save this location"}
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
                {cardDirty ? "Unsaved changes" : "No changes yet"} · a move also writes the location the person goes to.
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
