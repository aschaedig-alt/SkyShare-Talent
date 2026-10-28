"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import type { QohImportInfo } from "@/lib/quality-of-hire/report";
import type { QohPreview, QohSource } from "@/lib/quality-of-hire/imports";
import { R } from "@/components/reports/report-ui";
import { formatMomentDate } from "@/lib/dates/display";

// Admin only: the three files the Quality of Hire tab reads (lib/quality-of-hire/imports.ts).
// Choosing a file previews it and stores nothing; Save stores it, and the report uses
// the newest saved file of each kind. Undo puts the one before it back.

const FILES: Array<{ source: QohSource; title: string; what: string; accept: string }> = [
  {
    source: "terminations",
    title: "Paycom terminations report",
    what: "Employee Turnover Report (.xlsx) - its Terminated Employee Details tab gives voluntary or involuntary and the reason.",
    accept: ".xlsx"
  },
  {
    source: "termTypes",
    title: "HR's term-type sheet",
    what: "The fill-in sheet of older leavers (.csv) - V, I or unknown for exits Paycom never typed.",
    accept: ".csv"
  },
  {
    source: "interviews",
    title: "Calendar interviews",
    what: "One row per interview found on Google Calendar (.csv) - made outside the app, uploaded again whenever it is re-run.",
    accept: ".csv"
  }
];

type Pending = { source: QohSource; file: File; preview: QohPreview };

export function QualityOfHireUploads({ imports }: { imports: Record<QohSource, QohImportInfo> }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<QohSource | null>(null);
  const [message, setMessage] = useState<{ source: QohSource; text: string } | null>(null);
  const inputs = useRef<Partial<Record<QohSource, HTMLInputElement | null>>>({});

  async function send(source: QohSource, file: File, mode: "preview" | "save") {
    setBusy(source);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("source", source);
      form.set("mode", mode);
      form.set("file", file);
      const res = await fetch("/api/reports/quality-of-hire/import", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { preview?: QohPreview; message?: string };
      if (!res.ok || !body.preview) {
        setMessage({ source, text: body.message ?? "That did not work." });
        setPending(null);
        return;
      }
      if (mode === "preview") setPending({ source, file, preview: body.preview });
      else {
        setPending(null);
        setMessage({ source, text: `Saved ${file.name}.` });
        router.refresh();
      }
    } finally {
      setBusy(null);
      const input = inputs.current[source];
      if (input) input.value = "";
    }
  }

  async function undo(source: QohSource, batchId: string) {
    setBusy(source);
    setMessage(null);
    try {
      const res = await fetch("/api/reports/quality-of-hire/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ undo: batchId })
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setMessage({ source, text: res.ok ? "Undone - the file before it is back in use." : body.message ?? "That did not work." });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={clsx(R.box, "print:hidden")}>
      <div className={R.sectionLabel}>Update the data - admin only</div>
      <p className={R.footnote}>Choosing a file shows what it holds and stores nothing. Save puts it in use; Undo brings back the one before.</p>
      <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
        {FILES.map((f) => {
          const current = imports[f.source];
          const preview = pending?.source === f.source ? pending : null;
          const note = message?.source === f.source ? message.text : null;
          return (
            <li key={f.source} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={R.listTitle}>{f.title}</div>
                  <div className={R.tileSub}>{f.what}</div>
                  <div className={clsx("mt-1 text-[11px]", R.muted)}>
                    {current
                      ? `In use: ${current.file} - ${current.matched} of ${current.rows} rows matched - saved ${formatMomentDate(current.savedAt)}${current.uploadedBy ? ` by ${current.uploadedBy}` : ""}`
                      : "Nothing uploaded yet."}
                  </div>
                </div>
                <div className={R.controls}>
                  <input
                    ref={(el) => {
                      inputs.current[f.source] = el;
                    }}
                    type="file"
                    accept={f.accept}
                    className="hidden"
                    onChange={(ev) => {
                      const file = ev.target.files?.[0];
                      if (file) void send(f.source, file, "preview");
                    }}
                  />
                  <button type="button" className={R.smallButton} disabled={busy !== null} onClick={() => inputs.current[f.source]?.click()}>
                    {busy === f.source ? "Reading…" : "Choose file"}
                  </button>
                  {current ? (
                    <button type="button" className={R.smallButton} disabled={busy !== null} onClick={() => void undo(f.source, current.id)}>
                      Undo
                    </button>
                  ) : null}
                </div>
              </div>
              {preview ? (
                <div className={R.note}>
                  <div className={R.strong}>{preview.file.name}</div>
                  <ul className="mt-1 list-disc pl-5">
                    {preview.preview.facts.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                    <li>
                      {preview.preview.matched} of {preview.preview.rows} rows matched to a person
                    </li>
                  </ul>
                  {preview.preview.unmatched.length ? (
                    <p className="mt-1">
                      Not matched, left out until fixed: {preview.preview.unmatched.slice(0, 12).join("; ")}
                      {preview.preview.unmatched.length > 12 ? `; and ${preview.preview.unmatched.length - 12} more` : ""}
                    </p>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <button type="button" className={R.smallButton} disabled={busy !== null} onClick={() => void send(f.source, preview.file, "save")}>
                      {busy === f.source ? "Saving…" : "Save and use it"}
                    </button>
                    <button type="button" className={R.smallButton} disabled={busy !== null} onClick={() => setPending(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {note ? <p className={R.footnote}>{note}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
