"use client";

import { Bold, Palette } from "lucide-react";
import { inlineTextColorOptions } from "@/lib/formatting/rich-text";

type InlineColorOption = (typeof inlineTextColorOptions)[number];

type InlineFormatToolbarProps = {
  onBold: () => void;
  onColor: (color: InlineColorOption) => void;
};

export function InlineFormatToolbar({ onBold, onColor }: InlineFormatToolbarProps) {
  return (
    <div className="mb-2 rounded border border-brand-lea/10 bg-white px-2.5 py-2 shadow-sm dark:border-white/10 dark:bg-[#10243a]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-8 items-center gap-1.5 rounded bg-brand-cloudDancer px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-eden dark:bg-white/5">
          <Palette className="h-3.5 w-3.5" />
          Format
        </div>
        <button
          type="button"
          onClick={onBold}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-brand-lea/15 bg-white px-2.5 text-xs font-bold text-brand-lea transition hover:border-brand-eden/45 hover:bg-brand-sweet/30 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100"
          title="Bold selected text"
          aria-label="Bold selected text"
        >
          <Bold className="h-4 w-4" />
          Bold
        </button>
        <div className="h-6 w-px bg-brand-lea/12" />
        <div className="flex flex-wrap items-center gap-1.5">
          {inlineTextColorOptions.map((color) => (
            <button
              key={color.key}
              type="button"
              onClick={() => onColor(color)}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-brand-lea/15 bg-white px-2 text-[11px] font-bold text-brand-lea transition hover:border-brand-eden/45 hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100 dark:bg-white/5"
              title={`Color selected text ${color.label}`}
              aria-label={`Color selected text ${color.label}`}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-brand-lea/20 shadow-inner dark:border-white/10"
                style={{ backgroundColor: color.value }}
              />
              <span>{color.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
