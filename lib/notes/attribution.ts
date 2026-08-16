// Who wrote a note, for display.
//
// THE BUG THIS FIXES. CandidateNotes rendered `note.author ?? note.source`, and
// almost nothing has a linked author, so the fallback was doing nearly all the
// work: the raw source string appeared in the place a person's name goes. Every
// imported note displayed the literal words "JAZZ_FEEDBACK" as its author.
//
// Measured read-only against the live database rather than estimated, whole
// scope with every distinct source listed so the absent ones are visible too:
//
//   TOTAL candidate notes: 1386      authorId IS NULL: 1379   IS SET: 7
//     source="JAZZ_FEEDBACK"   rows=1357  authorless=1357
//     source="resume-intake"   rows=8     authorless=8
//     source="JAZZ"            rows=6     authorless=6
//     source="system"          rows=6     authorless=6
//     source="Manual"          rows=4     authorless=0
//     source="Front reply"     rows=3     authorless=0
//     source="document-intake" rows=2     authorless=2
//
// So this is not a JazzHR problem, it is every importer: 1,379 of 1,386 notes
// were affected and only the 7 written through the app had a real author.
//
// AND THE NAME IS NOT MISSING — IT IS IN THE WRONG PLACE. import-jazz-feedback.ts
// appends the real author to the END OF THE BODY as a trailing em-dash line
// (`\n\n— Aimee Schaedig`) instead of linking a User. So the recruiter was shown
// "JAZZ_FEEDBACK" at the top while "Aimee Schaedig" sat at the bottom of the
// text. This reads it back out of the body and puts it where it belongs.
//
// DISPLAY ONLY, deliberately. Backfilling authorId would mean matching 1,357
// free-text names to User rows and writing to a database that both dev and prod
// share, to fix something that is only ever rendered. The read-time fix costs
// nothing and cannot corrupt anything.

/**
 * Human labels for `CandidateNote.source`.
 *
 * Every key here was taken from the live distribution above, not invented. The
 * point of the map is that a source is a SYSTEM name and must never be rendered
 * where a person's name goes — an unmapped one falls through to "Unknown",
 * which is honest, rather than leaking a new raw enum into the UI.
 */
const SOURCE_LABELS: Record<string, string> = {
  JAZZ_FEEDBACK: "Imported from JazzHR",
  JAZZ: "Imported from JazzHR",
  "resume-intake": "Added by resume intake",
  "document-intake": "Added by document intake",
  system: "Added automatically",
  "Front reply": "Reply received in Front",
  Manual: "Added by hand"
};

/**
 * The trailing signature the importers leave behind: a final line that is an
 * em dash, a space, and a name.
 *
 * Deliberately strict. It must be the LAST line, and the name is capped at 60
 * characters, so an ordinary note that happens to end on an em-dash aside is not
 * mistaken for an attribution. Anything that fails this test falls back to the
 * source label rather than guessing.
 */
const SIGNATURE = /\n[ \t]*—[ \t]*([^\n]{1,60}?)[ \t]*$/;

export type NoteAttribution = {
  /** What to show where the author's name goes. Never a raw source string. */
  name: string;
  /**
   * True when the name was recovered from the body's trailing signature, which
   * means the body should be rendered WITHOUT it — otherwise the same name
   * appears twice on the same card.
   */
  fromSignature: boolean;
};

type NoteLike = {
  author?: string | null;
  source?: string | null;
  body?: string | null;
};

/** Who to credit for a note, in order of how much we trust the answer. */
export function noteAttribution(note: NoteLike): NoteAttribution {
  const linked = note.author?.trim();
  if (linked) return { name: linked, fromSignature: false };

  const signed = SIGNATURE.exec(note.body ?? "")?.[1]?.trim();
  if (signed) return { name: signed, fromSignature: true };

  const source = note.source?.trim();
  if (source && SOURCE_LABELS[source]) {
    return { name: SOURCE_LABELS[source], fromSignature: false };
  }

  return { name: "Unknown", fromSignature: false };
}

/** The note body with the trailing "— Name" signature removed. */
export function noteBodyWithoutSignature(body: string): string {
  return body.replace(SIGNATURE, "").trimEnd();
}
