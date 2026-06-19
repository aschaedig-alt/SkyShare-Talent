"use client";

import { CalendarClock } from "lucide-react";
import { isExpirableType } from "@/lib/files/document-types";

type FileLike = { documentType: string | null; displayFilename: string; expiresAt: string | null };

function daysUntil(iso: string) {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export function CurrencyPanel({ files }: { files: FileLike[] }) {
  const dated = files
    .filter((f) => f.expiresAt)
    .map((f) => ({ label: f.documentType || f.displayFilename, iso: f.expiresAt as string, days: daysUntil(f.expiresAt as string) }))
    .sort((a, b) => a.days - b.days);

  const undated = files.filter((f) => !f.expiresAt && isExpirableType(f.documentType));

  if (dated.length === 0 && undated.length === 0) return null;

  const anyAlert = dated.some((d) => d.days <= 30);

  return (
    <div className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
          <CalendarClock className="h-3.5 w-3.5" /> Currency
        </p>
        {dated.length > 0 && (
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${anyAlert ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {anyAlert ? "Action needed" : "Current"}
          </span>
        )}
      </div>

      {dated.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {dated.map((d, i) => {
            const tone = d.days < 0 ? "text-red-600" : d.days <= 30 ? "text-amber-600" : "text-emerald-600";
            const dot = d.days < 0 ? "bg-red-500" : d.days <= 30 ? "bg-amber-500" : "bg-emerald-500";
            return (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                <span className="flex-1 truncate text-brand-black/80">{d.label}</span>
                <span className={`shrink-0 font-semibold ${tone}`} title={fmt(d.iso)}>
                  {d.days < 0 ? `expired ${Math.abs(d.days)}d` : `${d.days}d`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {undated.length > 0 && (
        <p className="mt-3 text-[11px] text-brand-grey dark:text-slate-400">
          No expiry set: {undated.map((f) => f.documentType || f.displayFilename).join(", ")}. Add a date on the document to track it.
        </p>
      )}
    </div>
  );
}
