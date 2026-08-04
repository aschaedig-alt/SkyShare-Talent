"use client";

import { useEffect, useState } from "react";

// Shared people-link picker for the org charts (crew, maintenance, and any future
// department chart). Points a chart NAME at a Candidate record: names on the charts
// often differ from the profile (chart "Augustin Quintero" vs profile "Auggie
// Quintero"), so linking is an explicit pick, never a name match.
//
// It searches BOTH candidates AND current employees. An employee who has no
// candidate record yet (hired before the app, a direct hire, a rehire) still shows
// up; picking them creates/links a minimal candidate on the server and returns its
// id — so the chart link is always a candidate id, unchanged from before.

export type OrgCandidate = { id: string; displayName: string; currentTitle: string | null; stage?: string | null; archived?: boolean };
type OrgPerson = { id: string; displayName: string; currentTitle: string | null; kind: "candidate" | "employee"; candidateId: string | null; archived?: boolean };

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

/** Search for a person to link a chart name to. Pre-seeds with the chart name;
    the search matches on any WORD of a name and ranks current employees and live
    candidates first, so the seeded full name is now a reasonable opening query
    rather than something you have to delete. Calls onPick with the resolved
    candidate id. */
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
  // null = we have not searched this query yet. The picker opens PRE-SEEDED with
  // a name the app itself put on the chart, so with results defaulting to [] and
  // setLoading(true) living inside the debounce timer, every single open flashed
  // "Nobody found. Check the spelling" for 250ms — accusing the user of mistyping
  // a name they never typed.
  const [results, setResults] = useState<OrgPerson[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (q.trim().length < 2) {
      setResults(null);
      setLoading(false);
      setSearchFailed(false);
      return;
    }
    // Both of these belong OUTSIDE the timer — during the debounce we are already
    // searching, and whatever is on screen belongs to the previous query.
    setLoading(true);
    setSearchFailed(false);
    setResults(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/fleet/people-search?q=${encodeURIComponent(q.trim())}`);
        if (!res.ok) throw new Error("people search failed");
        const data = (await res.json()) as { people?: OrgPerson[] };
        if (alive) setResults(data.people ?? []);
      } catch {
        // A failed search is not an empty roster; keep results unknown.
        if (alive) setSearchFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  async function pick(p: OrgPerson) {
    // A candidate (or an employee already linked to one) resolves directly.
    if (p.candidateId) {
      onPick(p.candidateId, p.displayName);
      return;
    }
    // An unlinked current employee: ensure they have a candidate record, then link.
    setLinkingId(p.id);
    setError(null);
    try {
      const res = await fetch("/api/fleet/link-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hireId: p.id })
      });
      const data = (await res.json().catch(() => ({}))) as { candidateId?: string; displayName?: string; message?: string };
      if (res.ok && data.candidateId) {
        onPick(data.candidateId, data.displayName ?? p.displayName);
      } else {
        setError(data.message ?? "Couldn't link that person.");
      }
    } catch {
      setError("Couldn't link that person.");
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <div style={{ marginTop: 4, padding: 6, border: "1px solid var(--line, #cdd7e2)", borderRadius: 6, background: "var(--card, #fff)" }}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search people by name…"
        style={{ width: "100%", fontSize: 12, padding: "3px 6px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)" }}
      />
      <div style={{ maxHeight: 160, overflowY: "auto", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
        {loading ? <div style={{ fontSize: 11, opacity: 0.6, padding: 4 }}>Searching…</div> : null}
        {/* This used to say "try a last name", which was a workaround for a
            search that only matched the whole query as one string. That was
            fixed — any word of the name matches now — so the old advice was not
            just stale, it implied the search was still broken. */}
        {!loading && searchFailed ? (
          <div style={{ fontSize: 11, opacity: 0.6, padding: 4 }}>Couldn&apos;t run the search. Edit the name to try again.</div>
        ) : null}
        {/* results === null means "not searched yet", so this only ever fires on a
            search that actually came back with nothing. */}
        {!loading && !searchFailed && q.trim().length >= 2 && results !== null && results.length === 0 ? (
          <div style={{ fontSize: 11, opacity: 0.6, padding: 4 }}>Nobody found. Check the spelling, or search a different part of the name.</div>
        ) : null}
        {(results ?? []).map((p) => (
          <button
            key={`${p.kind}:${p.id}`}
            type="button"
            disabled={linkingId !== null}
            onClick={() => void pick(p)}
            style={{ textAlign: "left", fontSize: 12, padding: "3px 6px", borderRadius: 4, border: "1px solid var(--line, #cdd7e2)", background: "transparent", cursor: "pointer", opacity: linkingId && linkingId !== p.id ? 0.5 : 1 }}
          >
            <b>{p.displayName}</b>
            {p.currentTitle ? <span style={{ opacity: 0.7 }}> · {p.currentTitle}</span> : null}
            {p.kind === "employee" ? (
              <span style={{ opacity: 0.7 }}> · {linkingId === p.id ? "linking…" : "on staff"}</span>
            ) : p.archived ? (
              <span style={{ opacity: 0.7 }}> · archived</span>
            ) : null}
          </button>
        ))}
      </div>
      {error ? <div style={{ fontSize: 11, color: "#c23b52", padding: 4 }}>{error}</div> : null}
      <button type="button" onClick={onCancel} style={{ ...orgLinkBtnStyle, marginTop: 4 }}>
        Cancel
      </button>
    </div>
  );
}
