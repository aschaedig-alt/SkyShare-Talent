import { Fragment, type ReactNode } from "react";
import type { InlineTextColor, RichTextNode } from "@/lib/formatting/rich-text";
import { parseRichText } from "@/lib/formatting/rich-text";
import { parseBodySegments, splitCleanParagraphs } from "@/lib/formatting/text";

const inlineColorClasses: Record<InlineTextColor, string> = {
  BLACK: "text-brand-black dark:text-slate-100",
  LEA: "text-brand-lea dark:text-slate-100",
  EDEN: "text-brand-eden dark:text-[#8fb3d6]",
  GREY: "text-brand-grey dark:text-slate-400",
  GOLD: "text-brand-gold",
  RED: "text-brand-red dark:text-red-300",
  SWEET: "text-brand-sweet",
  CLOUD_DANCER: "text-brand-cloudDancer"
};

function renderNode(node: RichTextNode, key: string): ReactNode {
  if (node.type === "text") {
    return <Fragment key={key}>{node.text}</Fragment>;
  }

  if (node.type === "bold") {
    return (
      <strong key={key} className="font-bold">
        {node.children.map((child, index) => renderNode(child, `${key}-${index}`))}
      </strong>
    );
  }

  return (
    <span key={key} className={inlineColorClasses[node.color]}>
      {node.children.map((child, index) => renderNode(child, `${key}-${index}`))}
    </span>
  );
}

export function RichText({ value }: { value?: string | null }) {
  return <>{parseRichText(value).map((node, index) => renderNode(node, String(index)))}</>;
}

// Renders a body that mixes bullet lists and paragraphs (bodyFormat === "MIXED").
export function RichTextMixed({ value, textClass = "" }: { value?: string | null; textClass?: string }) {
  const segments = parseBodySegments(value);

  if (!segments.length) {
    return <p className="text-sm italic text-brand-grey dark:text-slate-400">No clean text entered yet.</p>;
  }

  return (
    <div className="space-y-3">
      {segments.map((segment, index) =>
        segment.type === "bullets" ? (
          <ul key={index} className={`space-y-2 text-sm leading-6 ${textClass}`}>
            {segment.items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-eden" />
                <span>
                  <RichText value={item} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className={`text-sm leading-6 ${textClass}`}>
            {segment.lines.map((line, lineIndex) => (
              <Fragment key={`${line}-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                <RichText value={line} />
              </Fragment>
            ))}
          </p>
        )
      )}
    </div>
  );
}

export function RichTextParagraphs({
  value,
  className = "space-y-3",
  paragraphClassName = "text-sm leading-6 text-brand-black/82 dark:text-slate-300",
  emptyText = "No clean text entered yet."
}: {
  value?: string | null;
  className?: string;
  paragraphClassName?: string;
  emptyText?: string;
}) {
  const paragraphs = splitCleanParagraphs(value);

  if (!paragraphs.length) {
    return <p className="text-sm italic text-brand-grey dark:text-slate-400">{emptyText}</p>;
  }

  return (
    <div className={className}>
      {paragraphs.map((paragraph, paragraphIndex) => (
        <p key={`${paragraph}-${paragraphIndex}`} className={paragraphClassName}>
          {paragraph.split("\n").map((line, lineIndex) => (
            <Fragment key={`${line}-${lineIndex}`}>
              {lineIndex > 0 && <br />}
              <RichText value={line} />
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
