"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Copy, Check, AlertTriangle } from "lucide-react";
import { buildBusinessCard, formatCardText } from "@/lib/business-cards/card";

// The person's ready-to-order card, on their profile. Same rules as the batch
// page — pilots/cabin attendants get the SkyOps line, everyone else SkyLove.
export function BusinessCardPanel({
  name,
  position,
  phone,
  ssEmail
}: {
  name: string;
  position: string | null;
  phone: string | null;
  ssEmail: string | null;
}) {
  const card = buildBusinessCard({ name, position, phone, ssEmail });
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatCardText(card));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-brand-lea dark:text-slate-100">
          <CreditCard className="h-4 w-4" /> Business card
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 dark:text-slate-100"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy for printer"}
          </button>
          <Link href="/business-cards" className="text-xs font-semibold text-brand-eden transition hover:text-brand-lea dark:text-slate-300">
            All cards
          </Link>
        </div>
      </div>

      <div className="mt-3 rounded bg-brand-lea px-4 py-3.5 text-white">
        <div className="text-base font-semibold leading-tight">{card.name || "—"}</div>
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-gold">{card.title || "—"}</div>
        <div className="mt-3 space-y-0.5 text-[11px] leading-relaxed text-white/85">
          <div>
            <span className="text-white/55">skyops</span> {card.skyops} &nbsp;·&nbsp; <span className="text-white/55">mobile</span> {card.mobile || "—"}
          </div>
          <div>
            <span className="text-white/55">email</span> {card.email || "—"} &nbsp;·&nbsp; <span className="text-white/55">web</span> {card.web}
          </div>
        </div>
      </div>

      {card.missing.length ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Add a {card.missing.join(" and ")} to this profile to complete the card.
        </p>
      ) : null}
    </section>
  );
}
