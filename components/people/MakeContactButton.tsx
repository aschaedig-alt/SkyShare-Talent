"use client";

import { useState } from "react";
import { ChevronDown, ContactRound, UserPlus, UserRoundPen } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { VCARD_PARTS, VCARD_PART_LABEL, type VcardPart } from "@/lib/new-hire-contacts/vcard-parts";

// "Make contact" — hands the phone this person's .vcf so they land in the
// Contacts app, and can then be shared on from there (Contacts' own "Share
// Contact") with a hiring manager.
//
// TWO WAYS IN (Aimee, feedback Nov 21 2026, with a screen recording). Adding a
// person who is ALREADY in her phone through "Add to Existing Contact" doubled
// the mobile number ("+1 (310) 752-3500" beside "(310) 752-3500") and both
// emails: the phone appends every line on the card and never checks what is
// already there. The app cannot read her phone's contacts to compare, so she
// chooses: a new contact gets the whole card; an existing one gets only the
// details she ticks — "something that tells me on the screen and I choose
// which info to add". See lib/new-hire-contacts/vcard-parts.ts.
//
// Three things about these elements are load-bearing, so do not "tidy" them:
//
//  1. The two actions are <a href>, not buttons with onClick. app/globals.css
//     kills pointer-events on every <button> inside a VIEW_ONLY module, so a
//     button here would be dead for exactly the read-only viewers this is meant
//     for. An <a> is untouched by that rule — and is the honest element for
//     "hand me a file" anyway. The opener is a <details>/<summary> and the
//     choices are checkboxes for the same reason: neither is muted by that rule.
//  2. Plain navigation, not the blob + synthetic <a download> pattern the CSV
//     exports use. That pattern is fine on a desktop and poor on iOS; pointing
//     the browser straight at a text/vcard response is what makes the phone open
//     its "Add to Contacts" sheet.
//  3. No `download` attribute for the same reason: it would force a file save
//     instead of the add-contact preview.

export type MakeContactDetails = Partial<Record<VcardPart, string | null>>;

export function MakeContactButton({
  hireId,
  hireName,
  details = {}
}: {
  hireId: string;
  hireName: string;
  /** What is on file, shown beside each tick box. A part with nothing on file is not offered. */
  details?: MakeContactDetails;
}) {
  const who = hireName.trim() || "this person";
  const base = `/api/new-hires/${encodeURIComponent(hireId)}/vcard`;
  const offered = VCARD_PARTS.filter((p) => (details[p] ?? "").trim());
  // Nothing ticked to start: for an EXISTING contact the safe default is to add
  // nothing she has not chosen, which is the whole point of this half.
  const [picked, setPicked] = useState<Set<VcardPart>>(new Set());
  const pickedList = offered.filter((p) => picked.has(p));

  function toggle(part: VcardPart, on: boolean) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(part);
      else next.delete(part);
      return next;
    });
  }

  return (
    <details className="group relative">
      <summary
        title={`Add ${who} to your contacts`}
        className={buttonClasses({ variant: "secondary", size: "sm", className: "shrink-0 cursor-pointer list-none [&::-webkit-details-marker]:hidden" })}
      >
        <ContactRound className="h-3.5 w-3.5" aria-hidden="true" />
        Make contact
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" />
      </summary>

      {/* In the page flow, not floating: it opens under the button and pushes
          the page down, so nothing is covered and nothing needs its own scroll. */}
      <div className="mt-2 w-full max-w-md space-y-3 rounded border border-brand-lea/15 bg-white p-3 text-sm shadow-panel dark:border-white/10 dark:bg-brand-panel">
        <div>
          <p className="font-semibold text-brand-lea dark:text-slate-100">Not in your phone yet?</p>
          <a href={base} className={buttonClasses({ variant: "primary", size: "sm", className: "mt-1.5" })}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Add as a new contact
          </a>
        </div>

        <div className="border-t border-brand-lea/10 pt-3 dark:border-white/10">
          <p className="font-semibold text-brand-lea dark:text-slate-100">Already in your phone?</p>
          {/* iPhone and Android differ here, so the hint names both. iPhone offers
              Add to Existing Contact and appends every line (her recording).
              Android opens the card in its Contacts app as a contact of its own;
              that is not verified on a real Android phone yet (needs-a-person). */}
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
            Tick only what is missing from {who}&apos;s contact. Your phone adds every line it is given, even one it
            already has in a different format, so leave those unticked.
          </p>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            <b>iPhone:</b> choose <b>Add to Existing Contact</b>. <b>Android:</b> it may save as a second contact; open
            Contacts and merge the two.
          </p>
          {offered.length === 0 ? (
            <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">Nothing else is on file for {who}.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {offered.map((part) => (
                <li key={part}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={picked.has(part)}
                      onChange={(e) => toggle(part, e.target.checked)}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-brand-grey dark:text-slate-400">{VCARD_PART_LABEL[part]}</span>
                      <span className="block break-words text-brand-black dark:text-slate-100">{details[part]}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {pickedList.length > 0 ? (
            <a
              href={`${base}?only=${pickedList.join(",")}`}
              className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-2" })}
            >
              <UserRoundPen className="h-3.5 w-3.5" aria-hidden="true" />
              Add {pickedList.length === 1 ? "this detail" : `these ${pickedList.length} details`}
            </a>
          ) : offered.length > 0 ? (
            <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">Tick at least one detail to add.</p>
          ) : null}
        </div>
      </div>
    </details>
  );
}
