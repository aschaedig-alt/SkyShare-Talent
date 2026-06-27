"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { CandidateProfileData } from "@/lib/data/candidates";

type CandidateCommunicationsProps = {
  communications: CandidateProfileData["communications"];
  total: number;
};

function formatDate(value: string | null) {
  if (!value) return "Undated";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

// Jazz stores message bodies as HTML. Render them as readable plain text (no
// dangerouslySetInnerHTML on archived third-party content).
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function CandidateCommunications({ communications, total }: CandidateCommunicationsProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Communication history</p>
        <span className="text-xs text-brand-grey dark:text-slate-400">
          {total} message{total === 1 ? "" : "s"}
          {total > communications.length ? ` · showing latest ${communications.length}` : ""}
        </span>
      </div>

      {communications.length === 0 ? (
        <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm dark:border-white/10 dark:bg-white/5">
          <div className="font-semibold text-brand-lea dark:text-slate-100">No messages</div>
          <p className="mt-1 text-brand-grey dark:text-slate-400">Archived email history with this candidate appears here.</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-brand-lea/8 dark:divide-white/5">
          {communications.map((c) => {
            const open = openId === c.id;
            return (
              <li key={c.id} className="py-2.5">
                <button onClick={() => setOpenId(open ? null : c.id)} className="flex w-full items-start gap-3 text-left">
                  <span
                    className={clsx(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      c.fromCandidate ? "bg-brand-sweet/30 text-brand-eden" : "bg-brand-gold/20 text-brand-eden"
                    )}
                    title={c.fromCandidate ? "From candidate" : "From team"}
                  >
                    {c.fromCandidate ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
                        {c.subject || "(no subject)"}
                      </span>
                      <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">{formatDate(c.sentAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-brand-grey dark:text-slate-400">
                      {c.fromCandidate ? "From" : "To"} {c.fromCandidate ? c.senderEmail : c.recipientEmail || "—"}
                    </span>
                  </span>
                </button>
                {open && c.body && (
                  <p className="mt-2 whitespace-pre-wrap rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 text-xs leading-relaxed text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                    {htmlToText(c.body).slice(0, 4000)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
