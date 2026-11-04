/**
 * Apply one sheet-scan suggestion to a DRAFT of the crew chart.
 *
 * Pure: takes copies, returns copies. The chart page calls it for both "Use
 * suggestion" and "Change with modifications" (which passes an edited copy of
 * the suggestion), then saves through the chart's own Save path, so a change
 * from a suggestion is exactly like a change made by hand.
 *
 * SEAT ARITHMETIC, chosen to match how the chart already behaves:
 *  - Putting someone INTO a seat uses up one of its open seats when it has one
 *    (a filled seat is no longer a req).
 *  - Taking someone OFF a seat reopens it as an open seat — the same thing the
 *    chart's term button does when a pilot leaves.
 *  - A RENAME also moves the person's profile link, because links are keyed by
 *    the exact name on the chart.
 */
import type { CrewGroup, Seat } from "@/lib/fleet/staffing/types";
import { cardKey, type Placement, type Suggestion } from "./compare";

type Draft = { groups: CrewGroup[]; links: Record<string, string> };

const seatOf = (groups: CrewGroup[], p: { card: string; seat: Placement["seat"] }): Seat | null => {
  const g = groups.find((x) => cardKey(x) === p.card);
  if (!g) return null;
  if (!g[p.seat]) g[p.seat] = {};
  return g[p.seat] as Seat;
};

function takeOff(groups: CrewGroup[], name: string, from: Placement, reopen: boolean): boolean {
  const s = seatOf(groups, from);
  const list = s?.[from.bucket];
  if (!s || !list) return false;
  const i = list.indexOf(name);
  if (i < 0) return false;
  list.splice(i, 1);
  if (reopen) s.open = (s.open ?? 0) + 1;
  return true;
}

function putIn(groups: CrewGroup[], name: string, to: Placement): boolean {
  const s = seatOf(groups, to);
  if (!s) return false;
  const list = (s[to.bucket] ??= []);
  if (!list.includes(name)) list.push(name);
  if ((s.open ?? 0) > 0) s.open = (s.open ?? 0) - 1;
  return true;
}

/** Returns the new draft, or an error when the chart no longer matches what the suggestion expected. */
export function applySuggestion(draft: Draft, s: Suggestion, opts: { reopenOldSeat?: boolean } = {}): Draft | { error: string } {
  const groups = structuredClone(draft.groups);
  const links = { ...draft.links };
  const reopen = opts.reopenOldSeat ?? true;

  switch (s.kind) {
    case "add":
      if (!putIn(groups, s.name.trim(), s.to)) return { error: "That aircraft is no longer on the chart." };
      break;
    case "move":
      if (!takeOff(groups, s.name, s.from, reopen && !(s.from.card === s.to.card && s.from.seat === s.to.seat))) {
        return { error: `${s.name} is no longer where the suggestion found them — the chart changed since the scan.` };
      }
      if (!putIn(groups, s.name, s.to)) return { error: "The aircraft they were moving to is no longer on the chart." };
      break;
    case "remove":
      if (!takeOff(groups, s.name, s.from, reopen)) return { error: `${s.name} is no longer on that seat — the chart changed since the scan.` };
      break;
    case "rename": {
      const seat = seatOf(groups, s.at);
      const list = seat?.[s.at.bucket];
      const i = list?.indexOf(s.from) ?? -1;
      if (!list || i < 0) return { error: `${s.from} is no longer on that seat — the chart changed since the scan.` };
      list[i] = s.to.trim();
      if (links[s.from]) {
        links[s.to.trim()] = links[s.from];
        delete links[s.from];
      }
      break;
    }
    case "seats": {
      const seat = seatOf(groups, s);
      if (!seat) return { error: "That aircraft is no longer on the chart." };
      seat.open = Math.max(0, Math.round(s.suggested.open));
      seat.parked = Math.max(0, Math.round(s.suggested.parked));
      if (!seat.open) delete seat.open;
      if (!seat.parked) delete seat.parked;
      break;
    }
  }
  return { groups, links };
}
