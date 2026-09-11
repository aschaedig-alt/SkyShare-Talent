"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CrewGroup, SeatKey } from "@/lib/fleet/staffing/types";
import type { SeatBackups, SeatBackupMatch } from "@/lib/fleet/staffing/backups.server";
import { normSeat } from "@/lib/fleet/staffing/compute";
import { aircraftLabel, positionLabel } from "@/lib/fleet/staffing/labels";
import { airframeOf, isUpgradeStep, ladderRank } from "@/lib/fleet/pilot-ladder";

// "We have our tentative hire, but if he does not work out, who are the next
// qualified candidates?" — her words, 2026-09-10.
//
// TWO HALVES, AND THE INTERNAL ONE IS FIRST ON PURPOSE.
//
//  INSIDE  — who already on the chart could move into this seat. Computed from
//            the chart plus lib/fleet/pilot-ladder.ts, with no database call at
//            all, so it works for EVERY aircraft today.
//  OUTSIDE — the ranked candidate shortlist, which reuses the same screening
//            engine the Matchboard runs. It only works where an ACTIVE hiring
//            profile exists, which today is 7 of the 20 fleet positions — so the
//            panel has to be able to say "there is nothing to rank here, and
//            here is why" without that reading as "nobody qualifies".
//
// Opening this is a detail pane on the same page, so the seat buttons are
// BUTTONS. Every candidate name inside is a real Link, because clicking one
// changes the whole screen.

const SEAT_WORD: Record<SeatKey, string> = { pic: "Captain", sic: "First Officer", cabin: "Cabin" };

/**
 * Stages that mean "this conversation is already over".
 *
 * The scan pool does not filter by stage — that predicate is shared with the
 * Matchboard, Job Screening and Pilot Requirements, and narrowing it would
 * silently shrink all three — so a raw shortlist genuinely does surface people
 * who withdrew or were turned down. Measured on a live scan, two of the top four
 * were Rejected and Withdrew. They are HIDDEN BY DEFAULT AND COUNTED, never
 * dropped: somebody rejected for one seat can be right for another, and a
 * backup plan that quietly deletes them is worse than one that folds them away.
 */
const CLOSED_STAGES = new Set(["rejected", "withdrew", "withdrawn", "hired"]);

function isClosedStage(stage: string | null): boolean {
  return Boolean(stage && CLOSED_STAGES.has(stage.trim().toLowerCase()));
}

type InternalOption = {
  name: string;
  gIdx: number;
  where: string;
  seatWord: string;
  /** same-rung = flies this type already; upgrade = this seat is a step up. */
  kind: "same-type" | "upgrade";
  /** Rungs between their aircraft and this one. 0 for a seat-only upgrade. */
  distance: number;
  /**
   * Their aircraft is not on the upgrade ladder, so the only thing making this
   * an upgrade is the seat (SIC to PIC is one whatever the aircraft).
   *
   * TRACKED SEPARATELY BECAUSE IT IS A REAL CASE AND IT SORTS WRONG OTHERWISE.
   * airframeOf returns null for a name it does not recognise — the live chart
   * has "Phenom 300e", which its own pattern misses because of the trailing "e"
   * — and an unknown rung would then read as distance 0, putting a first officer
   * five rungs down ABOVE the captain on the rung directly below. Unknown means
   * unknown: it sorts last among the upgrades rather than first.
   */
  unranked: boolean;
  candidateId?: string;
};

/**
 * Who on the chart could move into this seat.
 *
 * Only people ON THE LINE are considered. Somebody already in training, offered
 * or tentative is mid-move — counting them as a backup would be double-counting
 * the same person against two seats.
 */
function internalOptions(
  groups: CrewGroup[],
  gIdx: number,
  seatKey: SeatKey,
  links: Record<string, string>
): { ladderKnown: boolean; options: InternalOption[] } {
  const target = groups[gIdx];
  if (!target || seatKey === "cabin") return { ladderKnown: false, options: [] };
  const targetCode = airframeOf(target.name, null);
  const targetRank = ladderRank(targetCode);
  if (targetRank < 0) return { ladderKnown: false, options: [] };
  const targetSeat = seatKey === "pic" ? "PIC" : "SIC";

  // Best entry per person: a dual-qualified pilot sits on two cards and would
  // otherwise be listed twice against the same seat.
  const best = new Map<string, InternalOption>();
  groups.forEach((g, i) => {
    if (g.poolFlown) return;
    (["pic", "sic"] as SeatKey[]).forEach((sk) => {
      if (i === gIdx && sk === seatKey) return;
      const theirCode = airframeOf(g.name, null);
      const theirRank = ladderRank(theirCode);
      const theirSeat = sk === "pic" ? "PIC" : "SIC";
      const sameRung = theirRank >= 0 && theirRank === targetRank;
      let kind: InternalOption["kind"] | null = null;
      if (sameRung && theirSeat === targetSeat) kind = "same-type";
      else if (isUpgradeStep(theirSeat, theirCode, targetSeat, targetCode)) kind = "upgrade";
      if (!kind) return;
      const unranked = theirRank < 0;
      const distance = unranked ? 0 : Math.max(0, targetRank - theirRank);
      for (const name of normSeat(g[sk]).line) {
        const option: InternalOption = {
          name,
          gIdx: i,
          where: aircraftLabel(g),
          seatWord: SEAT_WORD[sk],
          kind,
          distance,
          unranked,
          ...(links[name] ? { candidateId: links[name] } : {})
        };
        const prev = best.get(name.toLowerCase());
        if (!prev || rankOption(option) < rankOption(prev)) best.set(name.toLowerCase(), option);
      }
    });
  });

  const options = [...best.values()].sort(
    (a, b) => rankOption(a) - rankOption(b) || a.name.localeCompare(b.name)
  );
  return { ladderKnown: true, options };
}

/** Lower sorts first: already flies the type, then the shortest step up, then
    anyone whose aircraft the ladder does not recognise. */
function rankOption(option: InternalOption): number {
  if (option.kind === "same-type") return 0;
  return option.unranked ? 1000 : 100 + option.distance;
}

const chip = (text: string, color: string, background: string) => (
  <span
    style={{
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: "0.02em",
      padding: "2px 6px",
      borderRadius: 4,
      color,
      background,
      whiteSpace: "nowrap"
    }}
  >
    {text}
  </span>
);

function readinessChip(match: SeatBackupMatch) {
  if (match.readiness === "Strong signal") return chip("Strong signal", "var(--fill-fg)", "var(--fill-soft)");
  if (match.readiness === "Worth a look") return chip("Worth a look", "var(--train-fg)", "var(--train-bg)");
  return chip("Needs review", "var(--n600)", "var(--n100)");
}

export function BackupPlan({
  groups,
  gIdx,
  links
}: {
  groups: CrewGroup[];
  gIdx: number;
  links: Record<string, string>;
}) {
  const group = groups[gIdx];
  const [openSeat, setOpenSeat] = useState<SeatKey | null>(null);
  const [cache, setCache] = useState<Record<string, SeatBackups>>({});
  const [loadingTitle, setLoadingTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  // Seats this aircraft actually has. A cabin seat is deliberately absent: the
  // ladder and every pilot requirement are about pilots, so a "backup plan" for
  // a cabin attendant would be a blank panel pretending to be an answer.
  const seats = useMemo(() => {
    const out: SeatKey[] = [];
    if (group?.pic) out.push("pic");
    if (group?.sic) out.push("sic");
    return out;
  }, [group]);

  const seatTitle = openSeat && group ? positionLabel(group, SEAT_WORD[openSeat]) : null;
  const internal = useMemo(
    () => (openSeat ? internalOptions(groups, gIdx, openSeat, links) : { ladderKnown: false, options: [] }),
    [groups, gIdx, openSeat, links]
  );
  const external = seatTitle ? cache[seatTitle] : undefined;

  const pickSeat = async (seatKey: SeatKey) => {
    if (openSeat === seatKey) {
      setOpenSeat(null);
      return;
    }
    setOpenSeat(seatKey);
    setError(null);
    if (!group) return;
    const title = positionLabel(group, SEAT_WORD[seatKey]);
    if (cache[title]) return;
    setLoadingTitle(title);
    try {
      const res = await fetch(`/api/fleet/seat-backups?title=${encodeURIComponent(title)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as SeatBackups;
      setCache((prev) => ({ ...prev, [title]: data }));
    } catch {
      setError("Could not load the candidate shortlist — check your connection or that you are signed in.");
    } finally {
      setLoadingTitle(null);
    }
  };

  if (!group || seats.length === 0) return null;

  const shownInternal = internal.options.slice(0, 10);
  const openMatches = external?.matches.filter((m) => !isClosedStage(m.stage)) ?? [];
  const closedMatches = external?.matches.filter((m) => isClosedStage(m.stage)) ?? [];
  const listed = showClosed ? [...openMatches, ...closedMatches] : openMatches;
  const shownExternal = listed.slice(0, 8);

  return (
    <div className="m-sect">
      <div className="mh4">Backup plan</div>
      <div className="m-sect-note" style={{ marginTop: 2 }}>
        If the person lined up for a seat falls through, who else is there. Pick a seat: inside means somebody already on
        the chart, outside means a ranked candidate.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {seats.map((seatKey) => (
          <button
            key={seatKey}
            type="button"
            onClick={() => void pickSeat(seatKey)}
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              border: "1px solid var(--n300)",
              background: openSeat === seatKey ? "var(--navy, #0d2c43)" : "transparent",
              color: openSeat === seatKey ? "#fff" : "inherit"
            }}
          >
            {positionLabel(group, SEAT_WORD[seatKey])}
          </button>
        ))}
      </div>

      {openSeat ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ---- INSIDE ------------------------------------------------- */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--n500)" }}>
              Already here · could move into this seat
            </div>
            {!internal.ladderKnown ? (
              <div style={{ fontSize: 12, color: "var(--n500)", marginTop: 6 }}>
                {group.name} is not on the upgrade ladder, so nobody can be ranked against it from the chart. Add it to
                lib/fleet/pilot-ladder.ts and this fills in.
              </div>
            ) : shownInternal.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--n500)", marginTop: 6 }}>
                Nobody on the chart flies this type or sits one step below it. This looked at every pilot on the line
                across all {groups.length} cards.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
                {shownInternal.map((option) => (
                  <div
                    key={`${option.name}-${option.gIdx}-${option.seatWord}`}
                    style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 12.5, padding: "4px 0", borderBottom: "1px dashed var(--n200)" }}
                  >
                    {option.candidateId ? (
                      <Link href={`/candidates/${option.candidateId}`} style={{ color: "inherit", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}>
                        {option.name}
                      </Link>
                    ) : (
                      <b>{option.name}</b>
                    )}
                    <span style={{ color: "var(--n500)", flex: "1 1 auto" }}>
                      {option.where} · {option.seatWord}
                    </span>
                    {option.kind === "same-type"
                      ? chip("Flies this type", "var(--fill-fg)", "var(--fill-soft)")
                      : option.unranked
                        ? chip("Seat upgrade · type unknown", "var(--n600)", "var(--n100)")
                        : chip(
                            option.distance === 0 ? "Seat upgrade" : `Up ${option.distance} rung${option.distance === 1 ? "" : "s"}`,
                            "var(--int-fg)",
                            "var(--int-bg)"
                          )}
                  </div>
                ))}
                {internal.options.length > shownInternal.length ? (
                  <div style={{ fontSize: 11.5, color: "var(--n500)", marginTop: 4 }}>
                    Showing the closest {shownInternal.length} of {internal.options.length}.
                  </div>
                ) : null}
                <div style={{ fontSize: 11.5, color: "var(--n500)", marginTop: 4 }}>
                  Worked out from the chart and the upgrade ladder. It says who COULD fly the seat, not who wants it —
                  nothing in the app records whether somebody is willing to move.
                </div>
              </div>
            )}
          </div>

          {/* ---- OUTSIDE ------------------------------------------------ */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--n500)" }}>
              Candidates · ranked against the hiring profile
            </div>
            {error ? <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 6 }}>{error}</div> : null}
            {loadingTitle === seatTitle ? (
              <div style={{ fontSize: 12, color: "var(--n500)", marginTop: 6 }}>Scanning the candidate pool…</div>
            ) : null}

            {/* STATE 1 — the seat does not map to a fleet position at all. */}
            {external && external.state === "unresolved" ? (
              <div style={{ fontSize: 12, color: "var(--n500)", marginTop: 6 }}>
                &ldquo;{external.requestedTitle}&rdquo; does not match a position in the fleet registry, so there is
                nothing to rank against.{" "}
                <Link href="/fleet/positions" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
                  Fleet positions
                </Link>{" "}
                is the master list.
              </div>
            ) : null}

            {/* STATE 2 — a real position, but no ACTIVE hiring profile behind it.
                This is most of the fleet today, so it says so plainly and points
                at the inactive profiles that are the raw material. */}
            {external && external.state === "no-profile" ? (
              <div style={{ fontSize: 12, color: "var(--n500)", marginTop: 6 }}>
                No active hiring profile exists for {external.positionTitle}, so nobody can be ranked for it yet —
                this is not an empty result, it is a scan that could not run. {external.inactiveProfileCount} inactive
                profile{external.inactiveProfileCount === 1 ? " is" : "s are"} on file.{" "}
                <Link href="/pilot-requirements" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
                  Pilot Requirements
                </Link>{" "}
                is where one is reactivated.
              </div>
            ) : null}

            {/* STATE 3 — a scan ran. An empty list is a real answer, and says how
                big the pool it came from was so it cannot be mistaken for a
                broken query. */}
            {external && external.state === "scanned" ? (
              <div style={{ marginTop: 6 }}>
                {shownExternal.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--n500)" }}>
                    Nobody cleared the minimums for {external.requirementTitle ?? external.positionTitle} out of{" "}
                    {external.scannedCount.toLocaleString()} candidates scanned ({external.scannedCurrent.toLocaleString()}{" "}
                    current, {external.scannedArchive.toLocaleString()} archived)
                    {closedMatches.length && !showClosed
                      ? `, and ${closedMatches.length} more are hidden because they were rejected, withdrew or are already hired`
                      : ""}
                    .
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {shownExternal.map((match) => (
                      <div
                        key={match.candidateId}
                        style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 12.5, padding: "4px 0", borderBottom: "1px dashed var(--n200)" }}
                      >
                        <Link href={`/candidates/${match.candidateId}`} style={{ color: "inherit", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}>
                          {match.name}
                        </Link>
                        <span style={{ color: "var(--n500)", flex: "1 1 auto" }}>
                          {match.currentTitle ?? "No current title on file"} · {match.minsMet}/{match.minsTotal} minimums
                        </span>
                        {match.stage
                          ? isClosedStage(match.stage)
                            ? chip(match.stage, "var(--cand-fg)", "var(--cand-bg)")
                            : chip(match.stage, "var(--n600)", "var(--n100)")
                          : chip("No stage", "var(--n600)", "var(--n100)")}
                        {match.fromArchive ? chip("Archive", "var(--n600)", "var(--n100)") : null}
                        {match.likelyOverqualified ? chip("High hours", "var(--train-fg)", "var(--train-bg)") : null}
                        {readinessChip(match)}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 11.5, color: "var(--n500)", marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span>
                    Ranked against {external.requirementTitle ?? external.positionTitle} · {external.scannedCount.toLocaleString()}{" "}
                    candidates scanned ({external.scannedCurrent.toLocaleString()} current, {external.scannedArchive.toLocaleString()}{" "}
                    archived)
                    {listed.length > shownExternal.length ? ` · showing the top ${shownExternal.length} of ${listed.length}` : ""}
                  </span>
                  {closedMatches.length ? (
                    <button
                      type="button"
                      onClick={() => setShowClosed((v) => !v)}
                      style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                    >
                      {showClosed ? "Hide" : "Show"} {closedMatches.length} rejected / withdrawn / already hired
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
