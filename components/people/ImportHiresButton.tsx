"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { parseHiresText, type HireParseResult } from "@/lib/onboarding/import-hires";

type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  taskChanges: number;
  results: { name: string; status: "created" | "updated" | "unchanged"; changed?: string[] }[];
};

const PREVIEW_COLS: { key: keyof HireParseResult["rows"][number]; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "position", label: "Position" },
  { key: "department", label: "Dept" },
  { key: "startDate", label: "Start" }
];

export function ImportHiresButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => (text.trim() ? parseHiresText(text) : null), [text]);

  function reset() {
    setText("");
    setResult(null);
    setError(null);
  }
  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  async function readFile(file: File) {
    const content = await file.text();
    setText(content);
    setResult(null);
  }

  async function runImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/new-hires/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows })
      });
      const data = (await res.json().catch(() => null)) as (ImportResult & { message?: string }) | null;
      if (!res.ok || !data) throw new Error(data?.message ?? "Import failed.");
      setResult(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
      >
        <Upload className="h-4 w-4" />
        Import hires
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !importing && close()} />
          <div className="relative w-full max-w-2xl rounded bg-white p-5 shadow-2xl dark:bg-[#10243a]">
            <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Import hires from your spreadsheet</h2>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              Paste or upload your sheet (works whether names run across the top or down the first column). Re-importing the whole
              sheet is safe — people already here get any changed dates/info updated (never wiped), unchanged ones are left alone, and
              anyone new is added.
            </p>

            {!result ? (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded border border-brand-lea/15 px-3 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload CSV
                  </button>
                  <span className="text-xs text-brand-grey dark:text-slate-400">or paste below</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
                  />
                </div>

                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError(null);
                  }}
                  rows={6}
                  placeholder={"Name\tOffer Sent\tStart Date\tPosition\tDepartment\nJane Pilot\t6/1/2026\t6/15/2026\tFirst Officer\tCrew"}
                  className="mt-2 w-full resize-y rounded border border-brand-lea/20 px-3 py-2 font-mono text-xs text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100"
                />

                {parsed && (
                  <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
                    <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                      {parsed.rows.length} {parsed.rows.length === 1 ? "person" : "people"} found
                      <span className="font-normal text-brand-grey dark:text-slate-400"> · {parsed.layout === "transposed" ? "names down the first column" : "one person per row"} detected</span>
                      {parsed.skippedNoName > 0 ? ` · ${parsed.skippedNoName} row(s) skipped (no name)` : ""}
                    </p>
                    {parsed.rows.some((r) => r.tasks.length > 0) && (
                      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                        Checklist statuses detected — they&apos;ll be applied too (TRUE → done, FALSE → to-do, N/A → n/a; blanks left alone).
                      </p>
                    )}
                    {parsed.unmapped.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        Not imported (no matching field): {parsed.unmapped.slice(0, 6).join(", ")}{parsed.unmapped.length > 6 ? ` +${parsed.unmapped.length - 6} more` : ""}
                      </p>
                    )}
                    {parsed.rows.length > 0 && (
                      <div className="mt-2 max-h-40 overflow-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                              {PREVIEW_COLS.map((c) => (
                                <th key={c.key} className="px-2 py-1">{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {parsed.rows.slice(0, 8).map((r, i) => (
                              <tr key={i} className="border-t border-brand-lea/10 dark:border-white/10">
                                {PREVIEW_COLS.map((c) => (
                                  <td key={c.key} className="px-2 py-1 text-brand-lea dark:text-slate-100">{r[c.key] ?? "—"}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {parsed.rows.length > 8 ? (
                          <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">…and {parsed.rows.length - 8} more</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {error ? <p className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}

                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={close} disabled={importing} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={runImport}
                    disabled={importing || !parsed || parsed.rows.length === 0}
                    className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
                  >
                    {importing ? "Importing…" : parsed && parsed.rows.length > 0 ? `Import ${parsed.rows.length}` : "Import"}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4">
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Added {result.created} · Updated {result.updated} · Unchanged {result.unchanged}
                    {result.taskChanges > 0 ? ` · ${result.taskChanges} checklist item${result.taskChanges === 1 ? "" : "s"} updated` : ""}.
                  </p>
                </div>
                {result.updated > 0 && (
                  <div className="mt-2 max-h-40 overflow-auto rounded border border-brand-lea/10 p-2 text-xs dark:border-white/10">
                    <p className="mb-1 font-semibold text-brand-lea dark:text-slate-100">Updated</p>
                    {result.results
                      .filter((r) => r.status === "updated")
                      .map((r, i) => (
                        <div key={i} className="text-brand-grey dark:text-slate-400">
                          {r.name}{r.changed && r.changed.length > 0 ? ` — ${r.changed.join(", ")}` : ""}
                        </div>
                      ))}
                  </div>
                )}
                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={close} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden">
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
