"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { SavedGuideOption } from "@/lib/data/interview-guides";
import { CONTROL_CLS, FIELD_CLS, FIELD_LABEL_CLS, GuideLinkPicker, type PickedCandidate } from "@/components/interview-guides/GuideLinkPicker";

// The two ends of "i save a guide then i choose which guide i want to add to
// the interview" (Aimee, Nov 16 2026). Using a saved guide COPIES its
// questions onto the interview; the saved guide stays as it is for the next one.

async function startGuide(guideId: string, body: { candidateId?: string | null; interviewId?: string | null; interviewer?: string | null }) {
  const res = await fetch(`/api/interview-guides/${guideId}/use`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const out = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !out.id) throw new Error(out.message ?? "Could not add the guide.");
  return out.id;
}

/** On an interview: pick one of the saved guides and add it. */
export function AddSavedGuide({ interviewId, hasGuides }: { interviewId: string; hasGuides: boolean }) {
  const router = useRouter();
  const [options, setOptions] = useState<SavedGuideOption[] | null>(null);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/interview-guides")
      .then((r) => (r.ok ? (r.json() as Promise<{ guides: SavedGuideOption[] }>) : { guides: [] }))
      .then((d) => live && setOptions(d.guides))
      .catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
  }, []);

  async function add() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const id = await startGuide(picked, { interviewId });
      // Straight to the copy, which is where the answers are typed.
      router.push(`/interview-questions/guides/${id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the guide.");
      setBusy(false);
    }
  }

  const build = `/interview-questions/guide?interviewId=${encodeURIComponent(interviewId)}`;

  return (
    <div className="rounded border border-brand-lea/15 p-3 dark:border-white/10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className={`${FIELD_CLS} flex-1`}>
          <span className={FIELD_LABEL_CLS}>{hasGuides ? "Add another saved guide" : "Add a saved guide"}</span>
          <select value={picked} onChange={(e) => setPicked(e.target.value)} disabled={busy || !options?.length} className={CONTROL_CLS}>
            <option value="">
              {options === null ? "Loading…" : options.length === 0 ? "No saved guides yet" : "Pick a guide"}
            </option>
            {(options ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.questionCount} question{o.questionCount === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void add()} disabled={busy || !picked}>
          <Plus className="h-4 w-4" /> {busy ? "Adding…" : "Add to interview"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Link href={build} className="inline-flex items-center gap-1 font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100">
          <ClipboardList className="h-3.5 w-3.5" /> Build a new guide for this interview
        </Link>
        <Link href="/interview-questions/guides" className="font-semibold text-brand-grey underline-offset-2 hover:text-brand-lea hover:underline dark:text-slate-400">
          Manage saved guides
        </Link>
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}

/** On a saved guide's own page: use it for an interview, or delete it. */
export function UseSavedGuide({ guideId, title }: { guideId: string; title: string }) {
  const router = useRouter();
  const [candidate, setCandidate] = useState<PickedCandidate | null>(null);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [interviewer, setInterviewer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const id = await startGuide(guideId, { candidateId: candidate?.id ?? null, interviewId, interviewer: interviewer.trim() || null });
      router.push(`/interview-questions/guides/${id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the guide.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the saved guide "${title}"? Interviews it was already used for keep their copy and answers.`)) return;
    const res = await fetch(`/api/interview-guides/${guideId}`, { method: "DELETE" });
    if (res.ok) router.push("/interview-questions/guides");
    else setError("Could not delete the guide.");
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-sweet">
          <Play className="h-3.5 w-3.5" /> Use for an interview
        </h2>
        <button
          type="button"
          onClick={() => void remove()}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-grey transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete saved guide
        </button>
      </div>
      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
        Puts a copy of these questions on the interview, ready to type answers into. This saved guide stays as it is.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-3">
        <GuideLinkPicker candidate={candidate} interviewId={interviewId} onCandidate={setCandidate} onInterview={setInterviewId} />
        <label className={FIELD_CLS}>
          <span className={FIELD_LABEL_CLS}>Interviewer</span>
          <input value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="Defaults to you" className={CONTROL_CLS} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-brand-lea/10 pt-4 dark:border-white/10">
        <Button onClick={() => void start()} disabled={busy || !candidate}>
          <Play className="h-4 w-4" /> {busy ? "Starting…" : "Start this guide"}
        </Button>
        {!candidate ? <span className="text-xs text-brand-grey dark:text-slate-400">Pick the candidate first.</span> : null}
        {error ? <span className="text-xs font-medium text-red-700 dark:text-red-300">{error}</span> : null}
      </div>
    </section>
  );
}
