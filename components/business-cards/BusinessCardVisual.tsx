import { Plane } from "lucide-react";
import type { BusinessCard } from "@/lib/business-cards/card";

// Faithful on-screen recreation of the printed SkyShare card: portrait, white,
// a red rail + plane down the left, the logo lockup, name + title, then the
// contact fields as red labels above black values. (No QR — added by the
// printer, not the app.) The exact logo mark can be swapped for the brand asset.
const RED = "#C8102E";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[7px] font-semibold tracking-wide" style={{ color: RED }}>
        {label}
      </div>
      <div className="text-[9px] font-medium text-[#1e1e1e]">{value || "—"}</div>
    </div>
  );
}

function SkyShareMark() {
  // Approximation of the red SkyShare swoosh mark — swap for the exact asset.
  return (
    <svg viewBox="0 0 28 20" className="h-3.5 w-auto" aria-hidden>
      <path d="M24 4C21 1.5 12 1.5 8 4c-2.6 1.6-2.2 4.3.6 5.6l7 3.2c2.8 1.3 3.2 4 .6 5.6-4 2.5-13 2.5-16 0" fill="none" stroke={RED} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

export function BusinessCardVisual({ card }: { card: BusinessCard }) {
  return (
    <div className="relative mx-auto aspect-[2/3.4] w-full max-w-[210px] overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-black/10">
      {/* red rail + plane down the left */}
      <span className="absolute bottom-5 left-4 top-16 w-px" style={{ backgroundColor: RED }} />
      <Plane className="absolute left-[9px] top-[52px] h-3.5 w-3.5 -rotate-45" style={{ color: RED }} strokeWidth={2} />

      <div className="flex h-full flex-col px-4 pb-5 pl-7 pt-5">
        {/* logo lockup */}
        <div className="flex items-center gap-1.5">
          <SkyShareMark />
          <span className="text-[9px] font-semibold tracking-[0.3em] text-[#3a3a3a]">SKYSHARE</span>
        </div>

        {/* name + title */}
        <div className="mt-5">
          <div className="text-[15px] font-bold leading-none text-[#1a1a1a]">{card.name || "—"}</div>
          <div className="mt-1.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-[#8c8c8c]">{card.title || "—"}</div>
        </div>

        {/* contact fields — red label above black value */}
        <div className="mt-4 space-y-2">
          <Field label="skyops" value={card.skyops} />
          <Field label="mobile" value={card.mobile} />
          <Field label="email" value={card.email} />
          <Field label="web" value={card.web} />
        </div>
      </div>
    </div>
  );
}
