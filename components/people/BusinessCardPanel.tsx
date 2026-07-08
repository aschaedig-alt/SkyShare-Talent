"use client";

import { useState } from "react";
import { CreditCard, Copy, Check } from "lucide-react";
import { buildBusinessCard, formatCardText } from "@/lib/business-cards/card";
import { BusinessCardVisual } from "@/components/business-cards/BusinessCardVisual";

// Compact "Business card" box for the profile — sits beside the checklist.
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
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-brand-lea dark:text-slate-100">
          <CreditCard className="h-4 w-4" /> Business card
        </h2>
        <button
          onClick={copy}
          title="Copy for printer"
          className="inline-flex items-center gap-1 rounded p-1.5 text-brand-grey transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-400 dark:hover:bg-white/10"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-3">
        <BusinessCardVisual card={card} />
      </div>
    </section>
  );
}
