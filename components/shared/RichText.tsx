import { Fragment, type ReactNode } from "react";
import type { InlineTextColor, RichTextNode } from "@/lib/formatting/rich-text";
import { parseRichText } from "@/lib/formatting/rich-text";
import { splitCleanParagraphs } from "@/lib/formatting/text";

const inlineColorClasses: Record<InlineTextColor, string> = {
  BLACK: "text-brand-black",
  LEA: "text-brand-lea",
  EDEN: "text-brand-eden",
  GREY: "text-brand-grey",
  GOLD: "text-brand-gold",
  RED: "text-brand-red",
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

export function RichTextParagraphs({
  value,
  className = "space-y-3",
  paragraphClassName = "text-sm leading-6 text-brand-black/82",
  emptyText = "No clean text entered yet."
}: {
  value?: string | null;
  className?: string;
  paragraphClassName?: string;
  emptyText?: string;
}) {
  const paragraphs = splitCleanParagraphs(value);

  if (!paragraphs.length) {
    return <p className="text-sm italic text-brand-grey">{emptyText}</p>;
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
