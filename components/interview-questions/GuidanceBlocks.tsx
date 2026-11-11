"use client";

import { RichTextView } from "@/components/richtext/RichTextEditor";

/**
 * The two interviewer-guidance blocks under a question — "Strong answer" and
 * "Listen for" — drawn the same way in the question bank and the guide builder.
 * Renders nothing when both are empty.
 */
export function GuidanceBlocks({ strongAnswer, listenFor }: { strongAnswer: string; listenFor: string }) {
  if (!strongAnswer && !listenFor) return null;
  const block = (label: string, html: string) =>
    html ? (
      <div className="border-l-2 border-brand-sweet/40 pl-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-eden dark:text-brand-sweet">{label}</div>
        <RichTextView html={html} className="!text-xs !text-brand-grey dark:!text-slate-400 [&_p:first-child]:mt-0" />
      </div>
    ) : null;
  return (
    <div className="mt-2 grid gap-2">
      {block("Strong answer", strongAnswer)}
      {block("Listen for", listenFor)}
    </div>
  );
}
