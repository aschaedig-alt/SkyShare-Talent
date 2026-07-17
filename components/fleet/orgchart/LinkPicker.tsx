"use client";

import { useEffect, useState } from "react";

// Shared candidate-link picker for the org charts (crew, maintenance, and any
// future department chart). Points a chart NAME at a Candidate record: names on
// the charts often differ from the profile (chart "Augustin Quintero" vs profile
// "Auggie Quintero"), so linking is an explicit pick, never a name match.

export type OrgCandidate = { id: string; displayName: string; currentTitle: string | null; stage: string | null };

/** Small pill button used for the move / link / unlink affordances on a person row. */
export const orgLinkBtnStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 6px",
  borderRadius: 4,
  border: "1px solid var(--line, #cdd7e2)",
  background: "transparent",
  cursor: "pointer",
  whiteSpace: "nowrap"
};

/** Search for a candidate to link a chart name to. Pre-seeds the search with the
    chart name, though it often will not match — so a last-name search is the
    reliable move. Calls onPick with the chosen candidate's id. */
export function LinkPicker({
  initialQuery,
  onPick,
  onCancel
}: {
  initialQuery: string;
  onPick: (candidateId: string, displayName: string) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<OrgCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/candidates?q=${encodeURIComponent(q.trim())}`);
        const data = (await res.json()) as { candidates?: OrgCandidate[] };
        if (alive) setResults(data.candidates ?? []);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div style={{ marginTop: 4, padding: 6, border: "1px solid var(--line, #cdd7e2)", borderRadius: 6, background: "var(--card, #fff)" }}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search candidates by name…"
        style={{ width: "100%", fontSize: 12, padding: "3px 6px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)" }}
      />
      <div style={{ maxHeight: 160, overflowY: "auto", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
        {loading ? <div style={{ fontSize: 11, opacity: 0.6, padding: 4 }}>Searching…</div> : null}
        {!loading && q.trim().length >= 2 && results.length === 0 ? (
          <div style={{ fontSize: 11, opacity: 0.6, padding: 4 }}>No matches — try a last name.</div>
        ) : null}
        {results.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id, c.displayName)}
            style={{ textAlign: "left", fontSize: 12, padding: "3px 6px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", background: "transparent", cursor: "pointer" }}
          >
            <b>{c.displayName}</b>
            {c.currentTitle ? <span style={{ opacity: 0.7 }}> · {c.currentTitle}</span> : null}
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} style={{ ...orgLinkBtnStyle, marginTop: 4 }}>
        Cancel
      </button>
    </div>
  );
}
