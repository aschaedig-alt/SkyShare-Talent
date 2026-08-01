"use client";

import { useMemo, useState } from "react";

// "Find a person" — the flat, searchable list of everyone on an org chart, and
// a way to jump straight to where they sit.
//
// THE PROBLEM IT SOLVES: the charts are organised by AIRCRAFT (or by location),
// which is the right shape for staffing and the wrong shape for "where is this
// person?". With 26 tails you either remember which aircraft someone flies or
// you open cards until you find them.
//
// Shared by the crew and maintenance charts: both hand it a flat list of
// entries and a callback that opens the card the entry lives on. Neither chart
// knows how the other builds its entries, and this file knows about neither.
//
// It is a BUTTON, not a link, on purpose — picking a person opens a detail pane
// on the same page rather than navigating, which is exactly the case the "must
// be a real link" rule carves out.

export type IndexEntry = {
  name: string;
  /** Where they sit — "PC-12 (N418T)", "Ogden · Line". */
  where: string;
  /** What they are doing there — "Captain", "First Officer · in training". */
  role: string;
  /** Bucket, for the colour dot: line / train / offered / cand / candInt. */
  tone: "g" | "t" | "of" | "r" | "i";
  /** Index of the card this person is on. */
  cardIdx: number;
  /** Candidate profile id, when the name is linked to one. */
  candidateId?: string;
};

const TONE_COLOR: Record<IndexEntry["tone"], string> = {
  g: "var(--green, #2e7d32)",
  t: "var(--gold, #eaaa00)",
  of: "var(--gold, #eaaa00)",
  r: "var(--accent, #c0392b)",
  i: "var(--sweet, #a6c9e7)"
};

type SortKey = "Last name" | "Aircraft";

/** Surname for sorting: last whitespace-separated word, quoted nicknames out
    ('Jonathan "JJ" Jehle' sorts under Jehle, not under the quote). */
function lastName(name: string): string {
  const parts = name.replace(/"[^"]*"/g, " ").trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] ?? name).toLowerCase();
}

/** Does this entry match the query? Any WORD of the query against any word of
    the name — the same rule the people-search uses, so "nick lem" finds
    "Nicholas Lembo" and a bare surname works on its own. */
function matches(entry: IndexEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${entry.name} ${entry.where} ${entry.role}`.toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

export function PeopleIndex({
  entries,
  unit,
  onPick,
  onClose
}: {
  entries: IndexEntry[];
  /** What a card is called on this chart — "aircraft" or "location". */
  unit: string;
  onPick: (entry: IndexEntry) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("Last name");

  const shown = useMemo(() => {
    const list = entries.filter((e) => matches(e, query));
    list.sort((a, b) =>
      sort === "Last name"
        ? lastName(a.name).localeCompare(lastName(b.name)) || a.name.localeCompare(b.name)
        : a.where.localeCompare(b.where) || a.role.localeCompare(b.role) || lastName(a.name).localeCompare(lastName(b.name))
    );
    return list;
  }, [entries, query, sort]);

  // Duplicates are not a bug here: a dual-qualified pilot really is on two
  // aircraft, and both rows should be reachable. Count PEOPLE separately from
  // rows so the header does not overstate the roster.
  const peopleCount = useMemo(() => new Set(entries.map((e) => e.name.toLowerCase())).size, [entries]);

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid var(--line, #cdd7e2)",
        borderRadius: 4,
        background: "var(--card, #fff)",
        padding: 12
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${peopleCount} people on this chart…`}
          style={{
            flex: "1 1 220px",
            fontSize: 13,
            padding: "6px 9px",
            borderRadius: 4,
            border: "1px solid var(--line, #cdd7e2)",
            background: "transparent",
            color: "inherit"
          }}
        />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.65 }}>Sort</span>
          {(["Last name", "Aircraft"] as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 9px",
                borderRadius: 4,
                cursor: "pointer",
                border: "1px solid var(--line, #cdd7e2)",
                background: sort === key ? "var(--navy, #0d2c43)" : "transparent",
                color: sort === key ? "#fff" : "inherit"
              }}
            >
              {key === "Aircraft" ? unit.charAt(0).toUpperCase() + unit.slice(1) : key}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 4, cursor: "pointer", border: "1px solid var(--line, #cdd7e2)", background: "transparent", color: "inherit" }}
          >
            Close
          </button>
        </div>
      </div>

      <div style={{ maxHeight: 340, overflowY: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
        {shown.length === 0 ? (
          <div style={{ fontSize: 12.5, opacity: 0.7, padding: "10px 4px" }}>
            Nobody on this chart matches &ldquo;{query.trim()}&rdquo;. This searches the chart only — a pilot who has not been added to an {unit} yet will not be here.
          </div>
        ) : null}
        {shown.map((entry, i) => (
          <button
            key={`${entry.name}-${entry.cardIdx}-${entry.role}-${i}`}
            type="button"
            onClick={() => onPick(entry)}
            title={`Show ${entry.name} on ${entry.where}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              width: "100%",
              textAlign: "left",
              fontSize: 12.5,
              padding: "5px 8px",
              borderRadius: 4,
              border: "1px solid transparent",
              background: "transparent",
              color: "inherit",
              cursor: "pointer"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--gold, #eaaa00)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: TONE_COLOR[entry.tone], flex: "0 0 auto", alignSelf: "center" }} />
            <b style={{ flex: "0 0 auto" }}>{entry.name}</b>
            <span style={{ opacity: 0.8, flex: "1 1 auto" }}>
              {entry.where} · {entry.role}
            </span>
            <span style={{ opacity: 0.5, fontSize: 11, flex: "0 0 auto" }}>show →</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 8 }}>
        {shown.length} of {entries.length} row{entries.length === 1 ? "" : "s"} · a dual-qualified person appears once per {unit}. Picking someone opens their {unit} and highlights them.
      </div>
    </div>
  );
}
