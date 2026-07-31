"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, X, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { useDialogClose } from "@/lib/hooks/useDialogClose";

type DocResult = {
  filename: string;
  matched: boolean;
  candidateId: string | null;
  displayName: string | null;
  basis: string | null;
  linkedToJob: boolean;
  reactivated?: boolean;
  error?: string;
};

const ACCEPT = ".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png";

export function DocumentIntake({
  jobId,
  variant = "outline"
}: {
  jobId?: string;
  variant?: "outline" | "solid";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DocResult[] | null>(null);

  function reset() {
    setFiles([]);
    setResults(null);
    setError(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const close = useCallback(() => { setOpen(false); reset(); }, []);
  useDialogClose(close, open);

  // One file per request (serverless body cap), matched to an existing candidate server-side.
  async function submit() {
    if (files.length === 0) {
      setError("Choose at least one document.");
      return;
    }
    setBusy(true);
    setError(null);
    const acc: DocResult[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length });
      const file = files[i];
      const fallback: DocResult = { filename: file.name, matched: false, candidateId: null, displayName: null, basis: null, linkedToJob: false };
      try {
        const fd = new FormData();
        fd.append("files", file);
        if (jobId) fd.append("jobId", jobId);
        const res = await fetch("/api/document-intake", { method: "POST", body: fd });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { results?: DocResult[] };
          acc.push(body.results?.[0] ?? { ...fallback, error: "No result returned" });
        } else {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          acc.push({ ...fallback, error: body?.message ?? (res.status === 413 ? "File too large to upload" : `Upload failed (${res.status})`) });
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

  return (
    <>
      <Button
        variant={variant === "solid" ? "gold" : "secondary"}
        size={variant === "solid" ? "md" : "sm"}
        onClick={() => setOpen(true)}
      >
        <FilePlus2 className={variant === "solid" ? "h-4 w-4" : "h-3.5 w-3.5"} /> Upload documents
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={() => { setOpen(false); reset(); }}>
          <div className="w-full max-w-lg rounded bg-white p-5 shadow-xl dark:bg-brand-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Upload documents</h2>
              <button data-dialog-close onClick={() => { setOpen(false); reset(); }} className="rounded p-1 text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-xs text-brand-grey dark:text-slate-400">
              Each document is matched to an existing candidate — by the email in the file, then by the name on the filename — and attached. Anything it can&apos;t confidently match is left in the Documents &ldquo;Link&rdquo; queue.
            </p>

            {!results ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-sm text-brand-grey dark:text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-brand-lea file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-eden"
                />
                {files.length > 0 && (
                  <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-brand-black/80 dark:text-slate-300">
                    {files.map((f, i) => (
                      <li key={i} className="truncate rounded bg-brand-cloudDancer/40 px-2 py-1 dark:bg-white/5">{f.name}</li>
                    ))}
                  </ul>
                )}
                {error && <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
                  <Button onClick={submit} disabled={busy}>
                    {busy ? (progress ? `Matching ${progress.done + 1} of ${progress.total}…` : "Matching…") : `Upload ${files.length || ""} document${files.length === 1 ? "" : "s"}`.trim()}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="max-h-72 space-y-1.5 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5">
                      {r.error || !r.matched ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-brand-lea dark:text-slate-100">{r.filename}</div>
                        {r.error ? (
                          <div className="text-red-600 dark:text-red-300">{r.error}</div>
                        ) : r.matched ? (
                          <>
                            <div className="text-brand-grey dark:text-slate-400">→ {r.displayName} <span className="text-brand-grey/70 dark:text-slate-500">(matched by {r.basis})</span>{r.linkedToJob ? " · added to job" : ""}</div>
                            {r.reactivated && (
                              <div className="font-semibold text-brand-eden dark:text-brand-sweet">Brought back from the archive — they are a current applicant again</div>
                            )}
                          </>
                        ) : (
                          <div className="text-amber-700 dark:text-amber-300">{r.basis === "ambiguous" ? "Multiple candidates share that name" : "No matching candidate"} — left in the Link queue</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-brand-grey dark:text-slate-400">Unmatched files: open the candidate → Documents → Link to attach them.</p>
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
