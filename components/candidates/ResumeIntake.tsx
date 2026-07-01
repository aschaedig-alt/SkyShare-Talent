"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, X, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";

type IntakeResult = {
  filename: string;
  candidateId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  reused: boolean;
  linkedToJob: boolean;
  error?: string;
};

const ACCEPT = ".pdf,.doc,.docx,.txt,.rtf";

export function ResumeIntake({
  jobId,
  jobTitle,
  variant = "outline"
}: {
  jobId?: string;
  jobTitle?: string;
  variant?: "outline" | "solid";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<IntakeResult[] | null>(null);

  function reset() {
    setFiles([]);
    setResults(null);
    setError(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // Upload one file per request. Hosted serverless functions cap the request body
  // (~4.5 MB), so a batch of resumes in a single POST gets rejected before it reaches
  // the server. Per-file keeps each request small and lets one bad file fail alone.
  async function submit() {
    if (files.length === 0) {
      setError("Choose at least one resume.");
      return;
    }
    setBusy(true);
    setError(null);
    const acc: IntakeResult[] = [];

    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length });
      const file = files[i];
      const fallback: IntakeResult = { filename: file.name, candidateId: null, displayName: "", email: null, phone: null, reused: false, linkedToJob: false };
      try {
        const fd = new FormData();
        fd.append("files", file);
        if (jobId) fd.append("jobId", jobId);
        const res = await fetch("/api/resume-intake", { method: "POST", body: fd });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { results?: IntakeResult[] };
          acc.push(body.results?.[0] ?? { ...fallback, error: "No result returned" });
        } else {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          const msg = body?.message ?? (res.status === 413 ? "File too large to upload" : `Upload failed (${res.status})`);
          acc.push({ ...fallback, error: msg });
        }
      } catch {
        acc.push({ ...fallback, error: "Network error" });
      }
    }

    setProgress(null);
    setResults(acc);
    router.refresh();
    setBusy(false);
  }

  const btnClass =
    variant === "solid"
      ? "inline-flex items-center gap-1.5 rounded bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-sweet dark:text-slate-100"
      : "inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5";

  return (
    <>
      <button onClick={() => setOpen(true)} className={btnClass}>
        <FileUp className={variant === "solid" ? "h-4 w-4" : "h-3.5 w-3.5"} /> Upload resumes
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={() => { setOpen(false); reset(); }}>
          <div className="w-full max-w-lg rounded bg-white p-5 shadow-xl dark:bg-brand-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Upload resumes</h2>
              <button onClick={() => { setOpen(false); reset(); }} className="rounded p-1 text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-xs text-brand-grey dark:text-slate-400">
              Each resume becomes a candidate — name, email, and phone are read from the file and the resume is attached.
              {jobTitle ? <> They&apos;ll be added to <span className="font-semibold text-brand-lea dark:text-slate-100">{jobTitle}</span>.</> : null}
            </p>

            {!results ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-sm text-brand-grey file:mr-3 file:rounded file:border-0 file:bg-brand-lea file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-eden"
                />
                {files.length > 0 && (
                  <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-brand-black/80 dark:text-slate-300">
                    {files.map((f, i) => (
                      <li key={i} className="truncate rounded bg-brand-cloudDancer/40 px-2 py-1 dark:bg-white/5">{f.name}</li>
                    ))}
                  </ul>
                )}
                {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
                  <Button onClick={submit} disabled={busy}>
                    {busy ? (progress ? `Processing ${progress.done + 1} of ${progress.total}…` : "Processing…") : `Create ${files.length || ""} candidate${files.length === 1 ? "" : "s"}`.trim()}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="max-h-72 space-y-1.5 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5">
                      {r.error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                      <div className="min-w-0">
                        {r.error ? (
                          <div className="text-red-600"><span className="font-semibold">{r.filename}</span> — {r.error}</div>
                        ) : (
                          <>
                            <div className="font-semibold text-brand-lea">{r.displayName} {r.reused && <span className="font-normal text-brand-grey dark:text-slate-400">(existing)</span>}</div>
                            <div className="text-brand-grey dark:text-slate-400">{[r.email, r.phone].filter(Boolean).join(" · ") || "no contact found — edit on profile"}{r.linkedToJob ? " · added to job" : ""}</div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-brand-grey dark:text-slate-400">Names are best-guess from the file — open a profile to fix any that are off.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="secondary" onClick={reset}>Upload more</Button>
                  <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
