"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { formatDateTimeWithZone } from "@/lib/calendar/format";

// Pick the candidate a guide belongs to, then which of their interviews it was
// used in. Shared by the guide builder (before saving) and the guide page
// (linking a guide saved without one). The interview is optional: a guide can
// be saved to a candidate before the interview is on file.
//
// Renders its two boxes as two GRID CELLS (a fragment), so the parent lays them
// out in the same grid as its own boxes and all of them line up (his feedback
// Nov 16 2026: the Candidate and Interview boxes sat off-centre from the
// Interviewer and Name boxes because the Interview box carried a hint line).

export type PickedCandidate = { id: string; displayName: string };
export type InterviewOption = { id: string; title: string; interviewType: string; startDateTime: string; timezone: string | null; interviewer: string | null; status: string };

/** Same label style and 40px control height for every box in the section. */
export const FIELD_CLS = "flex min-w-0 flex-col gap-1.5";
export const FIELD_LABEL_CLS = "text-xs font-semibold text-brand-lea dark:text-slate-100";
export const CONTROL_CLS =
  "h-10 w-full rounded border border-brand-lea/20 bg-white px-3 text-sm text-brand-black outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
/** The one hint line under the whole section. */
export const LINK_HINT = "Linking the interview puts the guide on that interview, beside its core value scorecards.";

export function useCandidateInterviews(candidateId: string | null) {
  const [interviews, setInterviews] = useState<InterviewOption[] | null>(null);
  useEffect(() => {
    if (!candidateId) {
      setInterviews(null);
      return;
    }
    const ctrl = new AbortController();
    setInterviews(null);
    fetch(`/api/interview-guides/candidate-interviews?candidateId=${encodeURIComponent(candidateId)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { interviews: [] }))
      .then((b: { interviews: InterviewOption[] }) => setInterviews(b.interviews))
      .catch(() => {
        if (!ctrl.signal.aborted) setInterviews([]);
      });
    return () => ctrl.abort();
  }, [candidateId]);
  return interviews;
}

export function interviewOptionLabel(i: InterviewOption): string {
  return `${formatDateTimeWithZone(i.startDateTime, i.timezone)} · ${i.title}${i.interviewer ? ` · ${i.interviewer}` : ""}`;
}

type Found = { id: string; displayName: string; currentTitle: string | null; archived: boolean };

export function GuideLinkPicker({
  candidate,
  interviewId,
  onCandidate,
  onInterview
}: {
  candidate: PickedCandidate | null;
  interviewId: string | null;
  onCandidate: (c: PickedCandidate | null) => void;
  onInterview: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const interviews = useCandidateInterviews(candidate?.id ?? null);

  useEffect(() => {
    const q = query.trim();
    if (candidate || q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/candidates?q=${encodeURIComponent(q)}&includeArchived=1`, { signal: ctrl.signal });
        setResults(res.ok ? ((await res.json()) as { candidates: Found[] }).candidates : []);
      } catch {
        /* aborted */
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, candidate]);

  return (
    <>
      <div className={FIELD_CLS}>
        <span className={FIELD_LABEL_CLS}>Candidate</span>
        {candidate ? (
          <div className="flex h-10 items-center justify-between gap-2 rounded border border-brand-gold/50 bg-brand-gold/5 px-3 text-sm text-brand-lea dark:text-slate-100">
            <span className="min-w-0 truncate font-semibold">{candidate.displayName}</span>
            <button
              type="button"
              onClick={() => {
                onCandidate(null);
                onInterview(null);
                setQuery("");
              }}
              aria-label="Choose a different candidate"
              title="Choose a different candidate"
              className="shrink-0 rounded p-0.5 text-brand-grey transition hover:text-brand-lea dark:text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          // The results float over what is below rather than pushing the other
          // boxes down, so the grid stays even while searching.
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search candidates"
              className={`${CONTROL_CLS} pl-9`}
            />
            {query.trim().length >= 2 ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded border border-brand-lea/15 bg-white shadow-panel dark:border-white/10 dark:bg-brand-panel">
                {searching && !results ? <p className="px-3 py-2 text-xs text-brand-grey dark:text-slate-400">Searching…</p> : null}
                {results && results.length === 0 ? <p className="px-3 py-2 text-xs text-brand-grey dark:text-slate-400">Nobody matches.</p> : null}
                {results?.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onCandidate({ id: c.id, displayName: c.displayName });
                      onInterview(null);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:hover:bg-white/5"
                  >
                    <span className="font-semibold">{c.displayName}</span>
                    {c.currentTitle ? <span className="text-brand-grey dark:text-slate-400"> · {c.currentTitle}</span> : null}
                    {c.archived ? <span className="text-brand-grey dark:text-slate-400"> · archived</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <label className={FIELD_CLS}>
        <span className={FIELD_LABEL_CLS}>Interview</span>
        <select
          value={interviewId ?? ""}
          onChange={(e) => onInterview(e.target.value || null)}
          disabled={!candidate || interviews === null}
          className={CONTROL_CLS}
        >
          <option value="">
            {!candidate ? "Pick the candidate first" : interviews === null ? "Loading interviews…" : interviews.length === 0 ? "No interviews on file — link it later" : "Not linked to an interview yet"}
          </option>
          {(interviews ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {interviewOptionLabel(i)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
