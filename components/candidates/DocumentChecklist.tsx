"use client";

import { Check, X, Minus } from "lucide-react";
import { detectDocumentType } from "@/lib/files/document-types";

type FileLike = { documentType: string | null; displayFilename: string };

// The expected document set for a candidate. core=true → missing shows red (required);
// core=false → missing shows muted (nice-to-have).
const CHECKLIST: Array<{ type: string; core: boolean }> = [
  { type: "Resume", core: true },
  { type: "Pilot Application", core: true },
  { type: "Pilot's Certificate", core: true },
  { type: "Medical", core: true },
  { type: "Driver's License", core: true },
  { type: "Passport", core: true },
  { type: "Paycom Application", core: false },
  { type: "FCC Radio Operator's License", core: false },
  { type: "Insurance", core: false }
];

// Effective type = the saved tag, or a best-guess from the filename for older untagged files.
function effectiveType(file: FileLike): string {
  return file.documentType || detectDocumentType(file.displayFilename);
}

export function DocumentChecklist({ files }: { files: FileLike[] }) {
  const counts = new Map<string, number>();
  for (const f of files) {
    const t = effectiveType(f);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const present = CHECKLIST.filter((c) => counts.has(c.type)).length;
  const coreMissing = CHECKLIST.filter((c) => c.core && !counts.has(c.type)).length;

  return (
    <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Document checklist</p>
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${coreMissing === 0 ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
          {present}/{CHECKLIST.length}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {CHECKLIST.map((c) => {
          const count = counts.get(c.type) ?? 0;
          const has = count > 0;
          return (
            <li key={c.type} className="flex items-center gap-2 text-xs">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  has ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : c.core ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
                }`}
              >
                {has ? <Check className="h-3 w-3" /> : c.core ? <X className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              </span>
              <span className={`flex-1 truncate ${has ? "text-brand-black/80 dark:text-slate-300" : c.core ? "text-red-600 dark:text-red-300" : "text-brand-grey dark:text-slate-400"}`}>{c.type}</span>
              {count > 1 && <span className="shrink-0 rounded bg-brand-lea/10 px-1.5 text-[10px] font-semibold text-brand-grey dark:text-slate-400">{count}</span>}
            </li>
          );
        })}
      </ul>
      {coreMissing > 0 && (
        <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">{coreMissing} required document{coreMissing === 1 ? "" : "s"} missing.</p>
      )}
    </div>
  );
}
