import type { CrewGroup, CrewLeadership, TurnStat } from "./types";

// Crew Org Chart roster — reconciled to the Recruiting Status Tracking
// per-aircraft tabs (the authoritative rosters), plus Paycom/ARGUS/Fleet
// Summary/Hiring Metrics/Arrivals-Departures/Turnover dashboard (2026-07-13).
// Tab convention: GREEN = on line (`line`), IN-TRAINING = `train`, OPEN = `open`,
// OPEN (On Hold) = `parked`, TRANSITION OUT = `out`, "Dual Qualified (don't use
// for numbers)" = counted on primary aircraft, tagged "+TYPE" on that primary.

export const CREW_LEADERSHIP: CrewLeadership = {
  chiefName: "David Ricks",
  chiefRole: "Chief Pilot",
  reportsTo: "Reports to VP of Flight Ops",
  assistants: [
    { role: "Assistant Chief Pilot", name: "Devon Carter" },
    { role: "Assistant Director of Training", name: "Alexander Andrade" }
  ]
};

export const CREW_GROUPS: CrewGroup[] = [
  {
    name: "G450 / GV",
    pool: "SkyShare",
    sub: "2 aircraft · SkyShare",
    lead: "Patrick Bauder",
    out: [{ name: "Craig Little", reason: "departed 06/05" }],
    pic: { line: ["Patrick Bauder", "Brock Tyler", "Aleksandar Kostic"], train: ["Brett Moreland"] },
    sic: { line: ["Robbie Allen", "Mark Harris", "Nicholas Hastings", "Joel Garcia"] },
    cabin: { line: ["Lori Wilson", "Stephanie Hernandez", "Grace Ward"], openNamed: ["Lead Cabin Attendant"] },
    tags: {
      "Patrick Bauder": ["ARGUS"],
      "Brock Tyler": ["ARGUS"],
      "Aleksandar Kostic": ["ARGUS"],
      "Brett Moreland": ["ARGUS"]
    }
  },
  {
    name: "G200",
    pool: "SkyShare",
    sub: "3 aircraft · SkyShare",
    pic: { line: ["Aman Lal", "Eric Fowles", "Shawn Schiele", "Richard Vance", "Joshua Thompson", "Kathleen Larson", "Jerry Harrington"] },
    sic: { line: ["Maka Bailey", "Fabio Alves"], open: 2, parked: 1 },
    tags: {
      "Aman Lal": ["ARGUS", "Check Airman"],
      "Eric Fowles": ["ARGUS", "Check Airman"],
      "Shawn Schiele": ["ARGUS", "Standards"],
      "Joshua Thompson": ["ARGUS", "Standards", "+CJ2"],
      "Jerry Harrington": ["ARGUS", "+CJ2"]
    }
  },
  {
    name: "560XL",
    pool: "SkyShare",
    sub: "2 aircraft · SkyShare",
    out: [{ name: "Alec Smith", reason: "departed 06/05" }],
    pic: { line: ["Robert Bell", "Ben Fleckenstein", "Carl Wiltse", "Ian Marks", "David Gandolfi", "Kevin Smith"] },
    sic: { line: ["Bailey Barcelon"], cand: ["Matt Dahle"], parked: 2 },
    tags: {
      "Robert Bell": ["ARGUS"],
      "Ben Fleckenstein": ["ARGUS"],
      "Carl Wiltse": ["ARGUS", "Check Airman", "+CJ2"],
      "Ian Marks": ["ARGUS"],
      "Kevin Smith": ["ARGUS"],
      "David Gandolfi": ["+CJ2"]
    }
  },
  {
    name: "CJ2",
    pool: "SkyShare",
    sub: "3 aircraft · SkyShare",
    out: [
      { name: "Dayne Shafer", to: "Southwest", reason: "heading to airline" },
      { name: "Patrick Horan", reason: "departed 06/30" }
    ],
    pic: { line: ["Bryan Thomas", "Jeremy McGraw", "Benjamin Butler", "Kyle Ferrin", "Kylee Madsen", "Landon Roberts"], parked: 1 },
    sic: { line: ["Tommy Harvey", "Brooke Milne", "Benjamin Pobanz", "Luke Diederich", "Parker Hale"], parked: 2 },
    tags: {
      "Bryan Thomas": ["ARGUS"],
      "Jeremy McGraw": ["ARGUS"],
      "Benjamin Butler": ["+PC-12"],
      "Kylee Madsen": ["Check Airman", "+PC-12"],
      "Landon Roberts": ["+PC-12"]
    }
  },
  {
    name: "PC-12",
    pool: "SkyShare",
    sub: "4 aircraft · SkyShare",
    out: [{ name: "Chris Johnston", reason: "departed 06/15" }],
    pic: {
      line: [
        "Daniel Blanc", "Matt Dahle", "Chris Geradine", "Alvaro Martin", "Alexander Andrade", "Corby Alexander",
        "Nick Beine", "Adrienne Vaughn", "Nicholas Zehr", "Ren Carter", "Gavin Wunderlich", "Elijah Hall", "Caleb Green"
      ],
      open: 1,
      parked: 2
    },
    sic: { line: ["Karina Wilson", "Jacob Thacker", "Parker Potter", "Branigan Hughes"], train: ["Michael Salvagnini"], open: 1 }
  },
  {
    name: "G450",
    pool: "Managed",
    sub: "N787JS · Clean Spark",
    lead: "Sven Lepschy",
    pic: { line: ["Sven Lepschy"] },
    sic: { line: ["Carter Copeland"] },
    cabin: { line: ["Lauren Watt"] }
  },
  {
    name: "Legacy 650",
    pool: "Managed",
    sub: "N650JF · Layton Construction",
    lead: "Nick Carter",
    pic: { line: ["Nick Carter", "Russ Herman"] },
    sic: null
  },
  { name: "560 XLS+", pool: "Managed", sub: "N6TM · Onions 52", pic: { line: ["Zach Davis"] }, sic: { line: ["Jaren Smith"] } },
  { name: "Phenom 300e", pool: "Managed", sub: "N409KG · Ken Garff", lead: "Matt Garner", pic: { line: ["Matt Garner"] }, sic: { line: ["Will Page"] } },
  { name: "Phenom 100", pool: "Managed", sub: "N450JF · Layton Construction", pic: { train: ["Jonathan Siswick"] }, sic: { line: ["Truman Nelson"] } },
  { name: "Citation CJ", pool: "Managed", sub: "N443BC · Clean Spark", pic: { cand: ["Erik Schwerman"] }, sic: null },
  { name: "Citation M2", pool: "Managed", sub: "N785PD · Orchard Elms", pic: { line: ["Jack Matiasevich"] }, sic: null, tags: { "Jack Matiasevich": ["+PC-12"] } },
  { name: "PC-12", pool: "Managed", sub: "N418T · Fish Hawk Air", pic: { line: ["Shad Guffey"] }, sic: null },
  { name: "PC-12", pool: "Managed", sub: "N413UU · UofU", pic: { line: ["Jeff Gerrard", "John Bohman", "Kaytlin Francis"] }, sic: null },
  { name: "PC-12", pool: "Managed", sub: "N515RP · Fast Flight", poolFlown: true, pic: null, sic: null },
  { name: "PC-12", pool: "Managed", sub: "N739S · BAG Management", poolFlown: true, pic: null, sic: null },
  {
    name: "PC-12",
    pool: "Managed",
    sub: "N477KR · Orchard Elms",
    noCount: true,
    pic: { line: ["Jack Matiasevich"] },
    sic: null,
    tags: { "Jack Matiasevich": ["+M2"] }
  }
];

// Time-to-fill (avg days from req opened → start) from the Hiring Metrics
// "Time to Offer" tab (2026 fills). Turnover % is department-level (below),
// not per-aircraft, so per-card turnover stays "—".
const CREW_FILL_SS: Record<string, number> = {
  "G450 / GV": 40,
  CJ2: 49,
  "PC-12": 44
};
const CREW_FILL_MG: Record<string, number> = {
  N450JF: 103,
  N650JF: 19
};

export function turnoverFor(g: CrewGroup): TurnStat | undefined {
  const days = g.pool === "SkyShare" ? CREW_FILL_SS[g.name] : CREW_FILL_MG[g.sub.split(" ")[0]];
  return days != null ? { r: null, t: days } : undefined;
}

// Active training (from the "Training Info" tab), keyed by pilot name.
export const CREW_TRAINING: Record<string, string> = {
  "Brett Moreland": "in training 07/13–07/19 · CAE",
  "Jonathan Siswick": "in training 07/07–07/22 · CAE LAS",
  "Michael Salvagnini": "in training · PC-12 PDP"
};

// Department-level pilot turnover from the Turnover Manager Dashboard (12 mo).
export const CREW_PILOT_TURNOVER = { rate: "26.1%", period: "12 mo · Jun '25–May '26" };
