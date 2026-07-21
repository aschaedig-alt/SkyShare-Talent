"use client";

import { useEffect } from "react";
import { parsePastedDate } from "@/lib/dates/parse-pasted-date";

/**
 * Makes every <input type="date"> in the app accept a pasted date.
 *
 * Native date inputs only accept the browser's own segmented format, so pasting
 * "10/02/2026" out of a spreadsheet or an offer letter silently does nothing.
 * That is friction on every date in the product — travel, orientation, offer and
 * start dates included.
 *
 * Done as ONE document-level listener rather than a wrapper component swapped in
 * at each of the ~23 date inputs: it cannot regress the call sites, and any date
 * field added later is covered without anyone remembering to opt in.
 *
 * Anything the parser can't read confidently is left alone — the browser handles
 * the paste as it always did, so this can only ever add behaviour.
 */
export function PasteableDates() {
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const el = event.target;
      if (!(el instanceof HTMLInputElement) || el.type !== "date" || el.disabled || el.readOnly) return;

      const pasted = event.clipboardData?.getData("text") ?? "";
      const value = parsePastedDate(pasted);
      if (!value) return;

      event.preventDefault();

      // Assign through the native setter, then dispatch — React tracks the last
      // value it wrote on the DOM node, so setting el.value directly would be
      // treated as "unchanged" and the controlled onChange would never fire.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Capture phase, so a field with its own onPaste can't swallow it first.
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, []);

  return null;
}
