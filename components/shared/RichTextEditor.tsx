"use client";

import { useEffect, useMemo, useRef } from "react";
import { InlineFormatToolbar } from "@/components/shared/InlineFormatToolbar";
import type { InlineTextColor, RichTextNode } from "@/lib/formatting/rich-text";
import {
  escapeHtml,
  inlineTextColorMap,
  inlineTextColorOptions,
  parseRichText
} from "@/lib/formatting/rich-text";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  minHeightClassName?: string;
  placeholder?: string;
  enableBulletLine?: boolean;
};

const colorValueToKey = new Map(
  inlineTextColorOptions.flatMap((color) => [
    [color.value.toLowerCase(), color.key],
    [hexToRgb(color.value), color.key]
  ])
);

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
}

function nodesToEditorHtml(nodes: RichTextNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return escapeHtml(node.text);
      }

      if (node.type === "bold") {
        return `<strong>${nodesToEditorHtml(node.children)}</strong>`;
      }

      const color = inlineTextColorMap[node.color];
      return `<span data-rich-color="${node.color}" style="color: ${color.value};">${nodesToEditorHtml(
        node.children
      )}</span>`;
    })
    .join("");
}

function markupToEditorHtml(value: string) {
  return nodesToEditorHtml(parseRichText(value));
}

function isBlockElement(element: Element) {
  return ["DIV", "P", "LI"].includes(element.tagName);
}

function getElementColor(element: HTMLElement): InlineTextColor | null {
  const explicitColor = element.dataset.richColor as InlineTextColor | undefined;
  if (explicitColor && inlineTextColorMap[explicitColor]) {
    return explicitColor;
  }

  const attributeColor = element.getAttribute("color")?.toLowerCase();
  if (attributeColor && colorValueToKey.has(attributeColor)) {
    return colorValueToKey.get(attributeColor) ?? null;
  }

  const styleColor = element.style.color?.toLowerCase();
  if (styleColor && colorValueToKey.has(styleColor)) {
    return colorValueToKey.get(styleColor) ?? null;
  }

  return null;
}

function isBoldElement(element: HTMLElement) {
  const weight = element.style.fontWeight;
  const numericWeight = Number(weight);

  return (
    element.tagName === "B" ||
    element.tagName === "STRONG" ||
    weight === "bold" ||
    (!Number.isNaN(numericWeight) && numericWeight >= 600)
  );
}

function wrapMarkup(value: string, bold: boolean, color: InlineTextColor | null) {
  if (!value) {
    return "";
  }

  let nextValue = value;
  if (color) {
    nextValue = `[color=${inlineTextColorMap[color].tag}]${nextValue}[/color]`;
  }

  if (bold) {
    nextValue = `[b]${nextValue}[/b]`;
  }

  return nextValue;
}

function serializeNode(node: ChildNode, inheritedBold = false, inheritedColor: InlineTextColor | null = null): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return wrapMarkup(node.textContent?.replace(/\u00a0/g, " ") ?? "", inheritedBold, inheritedColor);
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (node.tagName === "BR") {
    return "\n";
  }

  const isBold = inheritedBold || isBoldElement(node);
  const color = getElementColor(node) ?? inheritedColor;
  const childMarkup = Array.from(node.childNodes)
    .map((child) => serializeNode(child, isBold, color))
    .join("");

  if (!isBlockElement(node)) {
    return childMarkup;
  }

  return `${childMarkup}\n`;
}

function editorHtmlToMarkup(element: HTMLElement) {
  let markup = "";

  for (const node of Array.from(element.childNodes)) {
    if (node instanceof HTMLElement && isBlockElement(node) && markup && !markup.endsWith("\n")) {
      markup += "\n";
    }

    markup += serializeNode(node);
  }

  return markup
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

export function RichTextEditor({
  value,
  onChange,
  minHeightClassName = "min-h-28",
  placeholder = "Type content...",
  enableBulletLine = false
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastHtmlRef = useRef("");
  const editorHtml = useMemo(() => markupToEditorHtml(value), [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor || editorHtml === lastHtmlRef.current) {
      return;
    }

    editor.innerHTML = editorHtml;
    lastHtmlRef.current = editorHtml;
  }, [editorHtml]);

  function saveSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection?.rangeCount) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection || !savedRangeRef.current) {
      editor?.focus();
      return;
    }

    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
    editor.focus();
  }

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    lastHtmlRef.current = editor.innerHTML;
    onChange(editorHtmlToMarkup(editor));
    saveSelection();
  }

  function runCommand(command: string, valueArg?: string) {
    restoreSelection();
    document.execCommand(command, false, valueArg);
    emitChange();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <InlineFormatToolbar
          onBold={() => runCommand("bold")}
          onColor={(color) => runCommand("foreColor", color.value)}
        />
        {enableBulletLine && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand("insertText", "\n- ")}
            className="inline-flex items-center gap-1 rounded border border-brand-lea/15 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer"
            title="Start a new bullet line"
          >
            <span className="text-brand-eden">•</span> Bullet line
          </button>
        )}
      </div>
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          onInput={emitChange}
          onBlur={emitChange}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onFocus={saveSelection}
          className={`${minHeightClassName} w-full whitespace-pre-wrap rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm leading-6 text-brand-black outline-none transition empty:before:pointer-events-none empty:before:text-brand-grey/70 empty:before:content-[attr(data-placeholder)] focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35`}
          data-placeholder={placeholder}
        />
      </div>
    </div>
  );
}
