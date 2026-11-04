/**
 * Compare the "Recruiting Status Tracking" sheet's per-aircraft tabs with the
 * crew chart and turn every real difference into a SUGGESTION. Feedback
 * cmw13vxfx (Nov 3): "can you scan my Google Doc daily and look for updates and
 * changes and then either change them here or suggest them?" — it suggests;
 * a person decides each one (keep as is / use the suggestion / change it).
 *
 * PURE: no Prisma, no Google, no clock. The daily job feeds it the sheet's cells
 * (lib/fleet/sheet-scan/sheet.server.ts) and the live roster; the chart page can
 * call it too.
 *
 * The rules come from a dry run against the real sheet and chart on Nov 3
 * (65 people in the same seat on both, every one of 96 sheet rows mapped to a
 * card). What that run taught, and what is built in here:
 *  - NICKNAMES are the same person: Nick/Nicholas, Ben/Benjamin, Kat/Kathleen.
 *  - SPELLING slips in the same seat ("Russ Hermian" / "Russ Herman") are the
 *    sheet's typos, not changes — counted, never suggested.
 *  - TRANSITION OUT of one aircraft while seated on another is a MOVE.
 *  - "Dual Qualified (don't use for numbers)" rows are ignored, as the sheet asks.
 *  - A tentative CANDIDATE on the chart who appears on no aircraft tab is left
 *    alone — tentatives often live only in Master's notes.
 *  - A card the sheet has NO rows for (N477KR, the pool-flown PC-12s) gets no
 *    seat-count suggestion: no data is not the same as zero seats.
 *  - The same first name leaving one seat and arriving in it under a different
 *    surname is a RENAME (Brooke Milne / Brooke Kirchner).
 */
import type { CrewGroup, Seat, SeatKey } from "@/lib/fleet/staffing/types";
import { normSeat } from "@/lib/fleet/staffing/compute";

export const SHEET_ID = "1ciM1uAWV1iN9Nqd2XIzj1dIt2m-tdp9bs0mNtzRpJ3U";
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

/** Aircraft tab -> how its rows find a chart card. `fractional` = the SkyShare-pool
    card's type name; `blank` = the card for rows with no aircraft written (a tail,
    or a type name); `alias` = words the sheet writes for a managed tail. */
export const SHEET_TABS: Record<string, { fractional?: string; blank?: string; alias?: Record<string, string> }> = {
  "G450/G5": { fractional: "G450 / GV" },
  "Legacy 650": { blank: "N650JF" },
  "Challenger 350": { blank: "N522AD" },
  G200: { fractional: "G200" },
  "560XL": { fractional: "560XL", alias: { ONION: "N6TM" } },
  CJ2: { fractional: "CJ2" },
  "PC-12": { fractional: "PC-12" },
  "CJ3 Utah": { blank: "Citation CJ3+" },
  CJ: { blank: "N443BC" },
  M2: { blank: "N785PD" },
  "Phenom 100": { blank: "N450JF" },
  "Phenom 300e / Longitude": { blank: "N409KG" }
};

/** Who is in a seat, as the chart stores them. */
export type PersonBucket = "line" | "train" | "cand" | "candInt" | "offered";
export const BUCKET_LABEL: Record<PersonBucket, string> = {
  line: "flying the line",
  train: "in training",
  cand: "tentative candidate",
  candInt: "internal move (tentative)",
  offered: "offer extended"
};
export type CrewSeat = Exclude<SeatKey, "cabin">;

/** A card is identified by type + sub line, which survives reordering the chart. */
export const cardKey = (g: Pick<CrewGroup, "name" | "sub">) => `${g.name}|${g.sub}`;
export const cardLabel = (g: Pick<CrewGroup, "name" | "sub">) => `${g.name} (${g.sub})`;

export type Placement = { card: string; seat: CrewSeat; bucket: PersonBucket };
export type SheetRef = { tab: string; row: number; text: string };

export type Suggestion =
  | { id: string; kind: "add"; name: string; to: Placement; source: SheetRef }
  | { id: string; kind: "move"; name: string; from: Placement; to: Placement; source: SheetRef }
  | { id: string; kind: "remove"; name: string; from: Placement; reason: string }
  | { id: string; kind: "rename"; from: string; to: string; at: Placement; source: SheetRef }
  | { id: string; kind: "seats"; card: string; seat: CrewSeat; current: { open: number; parked: number }; suggested: { open: number; parked: number }; source: SheetRef };

export type CompareResult = {
  suggestions: Suggestion[];
  /** People in the same seat on both. */
  agree: number;
  /** Same seat, spelled differently — the sheet's typos, shown as a count only. */
  spellings: { sheet: string; chart: string; tab: string; row: number }[];
  /** Sheet rows that pointed at no chart card (a tail not on the chart). */
  unmapped: SheetRef[];
};

// ---------------------------------------------------------------- names

const NICK: Record<string, string> = {
  nick: "nicholas", ben: "benjamin", josh: "joshua", kat: "kathleen", rob: "robert", bob: "robert",
  jake: "jacob", matt: "matthew", chris: "christopher", alex: "alexander", mike: "michael",
  tom: "thomas", tommy: "thomas", dan: "daniel", will: "william", jon: "jonathan", russ: "russell"
};
const parts = (n: string) => n.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
const key = (n: string) => {
  const p = parts(n);
  const first = NICK[p[0]] ?? p[0] ?? "";
  return p.length > 1 ? `${first} ${p[p.length - 1]}` : first;
};
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** "exact" | "fuzzy" (same person, spelled differently) | null */
export function samePerson(a: string, b: string): "exact" | "fuzzy" | null {
  const ka = key(a), kb = key(b);
  if (ka === kb) return "exact";
  const [fa, la = ""] = ka.split(" "), [fb, lb = ""] = kb.split(" ");
  if (la && la === lb && (fa.startsWith(fb) || fb.startsWith(fa))) return "fuzzy";
  if (la && lb && fa[0] === fb[0] && lev(la, lb) <= 2 && lev(fa, fb) <= 3) return "fuzzy";
  return null;
}
const firstName = (n: string) => key(n).split(" ")[0];

/** "Sven Lepschy (Lead)" -> "Sven Lepschy"; "John Murdoch ???" -> "John Murdoch"; holding rows -> null. */
function personName(raw: string): string | null {
  if (!raw || /^\(?\s*holding/i.test(raw)) return null;
  const n = raw.replace(/\([^)]*\)/g, " ").replace(/\?+/g, " ").replace(/\s+/g, " ").trim();
  return n || null;
}

type SheetBucket = PersonBucket | "open" | "parked" | "out" | "dual";
function bucketOf(status: string, hasName: boolean): SheetBucket | null {
  const s = status.toUpperCase();
  if (!s) return null;
  if (s.startsWith("DUAL")) return "dual";
  if (s.startsWith("GREEN")) return "line";
  if (s.startsWith("IN-TRAINING") || s.startsWith("IN TRAINING")) return "train";
  if (/TRANS(I|IS)TION IN/.test(s)) return "candInt";
  if (/TRANS(I|IS)TION OUT/.test(s)) return "out";
  if (s.startsWith("OPEN") && /HOLD/.test(s)) return "parked";
  if (s.startsWith("OPEN")) return hasName ? "cand" : "open";
  return null;
}
/** Chart buckets a sheet status is consistent with. */
const CONSISTENT: Record<PersonBucket, PersonBucket[]> = {
  line: ["line"],
  train: ["train"],
  cand: ["cand", "candInt", "offered"],
  candInt: ["candInt", "cand", "offered", "train"],
  offered: ["offered", "cand", "candInt"]
};

/** A short, stable fingerprint, so a "keep as is" decision survives daily scans
    and is only asked again when the sheet's row or the chart actually changes. */
function fingerprint(parts: unknown[]): string {
  const s = JSON.stringify(parts);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------- compare

type Entry = { tab: string; row: number; seat: CrewSeat; raw: string; name: string | null; status: string; bucket: SheetBucket; card: string | null; text: string };

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

export function compareSheetToChart(groups: CrewGroup[], tabs: Record<string, unknown[][]>): CompareResult {
  const byTailOrName = (want: string): CrewGroup | undefined =>
    groups.find((g) => g.sub.toUpperCase().startsWith(want.toUpperCase())) ??
    groups.find((g) => g.name === want && g.pool === "SkyShare") ??
    groups.find((g) => g.name === want);
  const fractional = (name: string) => groups.find((g) => g.name === name && g.pool === "SkyShare");

  // ---- read the sheet
  const entries: Entry[] = [];
  const unmapped: SheetRef[] = [];
  for (const [tab, cfg] of Object.entries(SHEET_TABS)) {
    const rows = (tabs[tab] ?? []).map((r) => (r ?? []).map(clean));
    const hdr = rows[0] ?? [];
    const picCol = hdr.findIndex((c) => /^CAPTAIN/i.test(c));
    const sicCol = hdr.findIndex((c) => /^FIRST OFFICER/i.test(c));
    rows.forEach((r, ri) => {
      if (ri === 0 || /^CAPTAIN|^FIRST OFFICER/i.test(r[picCol] ?? "")) return;
      for (const [seat, col] of [["pic", picCol], ["sic", sicCol]] as const) {
        if (col < 0) continue;
        const raw = r[col] ?? "", status = r[col + 2] ?? "", aircraft = r[col + 3] ?? "";
        if (!raw && !status) continue;
        const name = personName(raw);
        const bucket = bucketOf(status, !!name);
        if (!bucket) continue;
        const ac = aircraft.toUpperCase();
        let g: CrewGroup | undefined;
        // A tail the chart does not know yet (the CJ3 Utah tab says N838GD; the
        // chart card still reads "N?????") falls back to the tab's own card, so
        // the person on it is not mistaken for somebody missing.
        if (/^N[0-9A-Z]+$/.test(ac)) g = byTailOrName(ac) ?? (cfg.blank ? byTailOrName(cfg.blank) : undefined);
        else if (ac === "FRACTIONAL" && cfg.fractional) g = fractional(cfg.fractional);
        else if (cfg.alias?.[ac]) g = byTailOrName(cfg.alias[ac]);
        else if (!ac && cfg.blank) g = byTailOrName(cfg.blank);
        else if (!ac && cfg.fractional) g = fractional(cfg.fractional);
        const text = [raw || "(no name)", status, aircraft].filter(Boolean).join(" · ");
        if (!g) { unmapped.push({ tab, row: ri + 1, text }); continue; }
        entries.push({ tab, row: ri + 1, seat, raw, name, status, bucket, card: cardKey(g), text });
      }
    });
  }

  // ---- the chart, flattened
  type ChartPerson = { name: string; card: string; seat: SeatKey; bucket: PersonBucket };
  const chart: ChartPerson[] = [];
  for (const g of groups) {
    for (const seat of ["pic", "sic", "cabin"] as const) {
      const s = normSeat(g[seat] as Seat | null | undefined);
      for (const b of ["line", "train", "cand", "candInt", "offered"] as const) for (const n of s[b]) chart.push({ name: n, card: cardKey(g), seat, bucket: b });
    }
  }

  const suggestions: Suggestion[] = [];
  const spellings: CompareResult["spellings"] = [];
  let agree = 0;
  const adds: Extract<Suggestion, { kind: "add" }>[] = [];

  // ---- people on the sheet
  for (const e of entries) {
    if (!e.name || e.bucket === "dual" || e.bucket === "out" || e.bucket === "open" || e.bucket === "parked") continue;
    const want = e.bucket as PersonBucket;
    const hits = chart.map((p) => ({ p, m: samePerson(e.name!, p.name) })).filter((h) => h.m);
    const here = hits.find((h) => h.p.card === e.card && h.p.seat === e.seat && CONSISTENT[want].includes(h.p.bucket));
    if (here) {
      if (here.m === "fuzzy" && key(here.p.name) !== key(e.name)) {
        // Nicknames are the same spelling under key(); anything left is a typo.
        spellings.push({ sheet: e.name, chart: here.p.name, tab: e.tab, row: e.row });
      }
      agree++;
      continue;
    }
    const source = { tab: e.tab, row: e.row, text: e.text };
    const to: Placement = { card: e.card!, seat: e.seat, bucket: want };
    const from = hits.find((h) => h.p.seat !== "cabin");
    if (from) {
      const f: Placement = { card: from.p.card, seat: from.p.seat as CrewSeat, bucket: from.p.bucket };
      suggestions.push({ id: fingerprint(["move", from.p.name, f, to, e.text]), kind: "move", name: from.p.name, from: f, to, source });
    } else {
      const s = { id: fingerprint(["add", e.name, to, e.text]), kind: "add" as const, name: e.name, to, source };
      adds.push(s);
      suggestions.push(s);
    }
  }

  // ---- people on the chart that no aircraft tab mentions at all
  const sheetNames = entries.filter((e) => e.name).map((e) => e.name!);
  for (const p of chart) {
    if (p.seat === "cabin" || (p.bucket !== "line" && p.bucket !== "train")) continue;
    if (sheetNames.some((n) => samePerson(n, p.name))) continue;
    const from: Placement = { card: p.card, seat: p.seat as CrewSeat, bucket: p.bucket };
    // A RENAME: the same first name arriving in exactly this seat under another surname.
    const pairIdx = adds.findIndex((a) => a.to.card === p.card && a.to.seat === p.seat && a.to.bucket === p.bucket && firstName(a.name) === firstName(p.name));
    if (pairIdx >= 0) {
      const add = adds[pairIdx];
      adds.splice(pairIdx, 1);
      suggestions.splice(suggestions.indexOf(add), 1);
      suggestions.push({ id: fingerprint(["rename", p.name, add.name, from]), kind: "rename", from: p.name, to: add.name, at: from, source: add.source });
      continue;
    }
    suggestions.push({ id: fingerprint(["remove", p.name, from]), kind: "remove", name: p.name, from, reason: "No aircraft tab on the sheet lists them" });
  }

  // ---- open and on-hold seat counts, only for cards the sheet actually covers
  const covered = new Set(entries.map((e) => `${e.card}|${e.seat}`));
  const counts = new Map<string, { open: number; parked: number; rows: number[]; tab: string }>();
  for (const e of entries) {
    if (e.bucket !== "open" && e.bucket !== "parked") continue;
    const k = `${e.card}|${e.seat}`;
    const c = counts.get(k) ?? { open: 0, parked: 0, rows: [], tab: e.tab };
    c[e.bucket]++;
    c.rows.push(e.row);
    counts.set(k, c);
  }
  for (const g of groups) {
    for (const seat of ["pic", "sic"] as const) {
      const k = `${cardKey(g)}|${seat}`;
      if (!covered.has(k)) continue;
      const s = normSeat(g[seat] as Seat | null | undefined);
      const c = counts.get(k) ?? { open: 0, parked: 0, rows: [], tab: entries.find((e) => e.card === cardKey(g))?.tab ?? "" };
      if (c.open === s.open && c.parked === s.parked) continue;
      const suggested = { open: c.open, parked: c.parked };
      const text = c.rows.length ? `rows ${c.rows.join(", ")}: ${c.open} open, ${c.parked} on hold` : "no open or on-hold rows";
      suggestions.push({
        id: fingerprint(["seats", cardKey(g), seat, { open: s.open, parked: s.parked }, suggested]),
        kind: "seats",
        card: cardKey(g),
        seat,
        current: { open: s.open, parked: s.parked },
        suggested,
        source: { tab: c.tab, row: c.rows[0] ?? 0, text }
      });
    }
  }

  return { suggestions, agree, spellings, unmapped };
}
