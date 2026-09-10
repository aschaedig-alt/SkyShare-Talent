// The one sanitiser for an email body that was typed in a send dialog.
//
// It was written for the orientation email, then copied into the generic
// checklist-task email, and was about to be copied a third and fourth time into
// the welcome and contacts sends. Four copies of a security-shaped function is
// how one of them quietly stops matching the others, so there is now one.
//
// Scope: this runs over contenteditable output that a signed-in member of staff
// produced in a confirm dialog, on its way to a Front message. It is not a
// general-purpose HTML sanitiser and must not be treated as one — it strips the
// tags and attributes that could execute, and deliberately leaves the template's
// own inline styles and structure alone, because preserving those byte-for-byte
// is the entire reason the dialog edits raw HTML rather than a normalised model.

export function cleanEditedBody(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

/** The banner the preview and the send record both hang off. One string, so a
 *  dialog cannot describe an edited send differently from the history does. */
export const EDITED_BODY_WARNING =
  "EDITED FOR THIS SEND — the body below was changed by hand and is no longer the Front template. The change applies to this send only; the template in Front is untouched and every later send reads it fresh.";
