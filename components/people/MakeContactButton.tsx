"use client";

import { ContactRound } from "lucide-react";
import { buttonClasses } from "@/components/ui";

// "Make contact" — hands the phone this person's .vcf so they land in the
// Contacts app, and can then be shared on from there (Contacts' own "Share
// Contact") with a hiring manager.
//
// Two things about this element are load-bearing, so do not "tidy" it into a
// <button>:
//
//  1. It is an <a href>, not a button with an onClick. app/globals.css kills
//     pointer-events on every <button> inside a VIEW_ONLY module, so a button
//     here would be dead for exactly the read-only viewers this is meant for.
//     An <a> is untouched by that rule — and is the honest element for "hand me
//     a file" anyway.
//  2. Plain navigation, not the blob + synthetic <a download> pattern the CSV
//     exports use. That pattern is fine on a desktop and poor on iOS; pointing
//     the browser straight at a text/vcard response is what makes the phone open
//     its "Add to Contacts" sheet.
//
// No `download` attribute for the same reason: it would force a file save
// instead of the add-contact preview.

export function MakeContactButton({ hireId, hireName }: { hireId: string; hireName: string }) {
  const who = hireName.trim();
  const label = who ? `Add ${who} to your contacts` : "Add this person to your contacts";

  return (
    <a
      href={`/api/new-hires/${encodeURIComponent(hireId)}/vcard`}
      title={label}
      aria-label={label}
      className={buttonClasses({ variant: "secondary", size: "sm", className: "shrink-0" })}
    >
      <ContactRound className="h-3.5 w-3.5" aria-hidden="true" />
      Make contact
    </a>
  );
}
