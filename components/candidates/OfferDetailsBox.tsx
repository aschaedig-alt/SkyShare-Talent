"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { formatMomentDate } from "@/lib/dates/display";

/**
 * The hiring manager's offer details, in their own words.
 *
 * Aimee asked for this on 2026-09-14 and described it herself: "somewhere in
 * here i need to have the info for offer details provided by HM … maybe its just
 * a text box i can put the info they give me in our front chat into". So it is
 * ONE box, not thirteen fields — the message arrives as a block of text in Front
 * and re-typing it into a form is the work she was trying to avoid.
 *
 * THIS IS THE ONLY PLACE IN THE APP THAT MAY HOLD A PAY AMOUNT. The standing
 * rule from 2026-07-16 is that Paycom owns compensation and nothing here stores
 * it; the user made this one exception on 2026-09-22, choosing it over the same
 * box with the pay lines removed. What follows from that, and is not decoration:
 *  - it renders only for the HR team, and the text is only ever sent to an HR
 *    session (the route answers allowed:false with no text for anybody else, so
 *    a non-HR browser never receives it at all);
 *  - the template below stays as the ONE definition of the lines, so dropping
 *    the pay lines later is an edit to PAY_LINES and nothing else.
 *
 * It lives inside the offer, so the candidate's Offers tab and the hire's
 * checklist show the same box rather than two copies that drift.
 */

/** Her thirteen lines, in her order. */
const TEMPLATE_LINES = [
  "Name:",
  "Training Contract Length & Amount:",
  "Position/Assignment:",
  "Base Location:",
  "Start Date:",
  "Pay Rate:",
  "Reduced Training Pay:",
  "Pre-approved Time Off:",
  "Must Relocate By:",
  "Relocation Bonus:",
  "Sign-On Bonus:",
  "Training Date:",
  "Other:"
] as const;

/** The five that carry money. Named so the B version is one edit, not a hunt. */
const PAY_LINES = new Set([
  "Training Contract Length & Amount:",
  "Pay Rate:",
  "Reduced Training Pay:",
  "Relocation Bonus:",
  "Sign-On Bonus:"
]);

const TEMPLATE = TEMPLATE_LINES.join("\n");

type Loaded = { allowed: boolean; text: string | null; at: string | null; by: string | null };

export function OfferDetailsBox({ applicationId, canEdit }: { applicationId: string; canEdit: boolean }) {
  const [state, setState] = useState<Loaded | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // What the server last confirmed, so blur only writes when something changed.
  const committed = useRef("");

  useEffect(() => {
    let live = true;
    fetch(`/api/candidate-applications/${applicationId}/offer-details`)
      .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : null))
      .then((data) => {
        if (!live || !data) return;
        setState(data);
        const text = data.text ?? "";
        setValue(text);
        committed.current = text;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [applicationId]);

  const save = useCallback(
    async (text: string) => {
      setSaving(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/candidate-applications/${applicationId}/offer-details`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Loaded;
        committed.current = data.text ?? "";
        setSavedAt(data.at);
        setState((s) => (s ? { ...s, ...data } : data));
      } catch {
        setFailed(true);
      } finally {
        setSaving(false);
      }
    },
    [applicationId]
  );

  // Saved when you click away, like the rest of the hire page. A box somebody
  // pasted into and then navigated away from is the case that must not lose
  // anything, so this is on blur rather than on a button.
  const commit = useCallback(() => {
    // The untouched template is not content: saving it would stamp "details
    // received" on an offer nobody has heard about yet.
    const next = value.trim() === TEMPLATE.trim() ? "" : value;
    if (next === committed.current) return;
    void save(next);
  }, [save, value]);

  if (!state?.allowed) return null;

  const empty = !committed.current;
  const showing = value || (canEdit ? TEMPLATE : "");

  return (
    <div className="mt-3 rounded border border-brand-lea/12 bg-brand-cloudDancer/35 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
          Offer details from the hiring manager
        </span>
        <span className="flex items-center gap-1 rounded bg-brand-lea px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-brand-sweet/25 dark:text-slate-100">
          <Lock className="h-2.5 w-2.5" />
          HR only
        </span>
        <span className="ml-auto text-[11px] text-brand-grey dark:text-slate-400">
          {saving ? (
            "Saving…"
          ) : failed ? (
            <button
              onClick={() => void save(value)}
              className="font-semibold text-red-700 underline underline-offset-2 dark:text-red-300"
            >
              Couldn&rsquo;t save — retry
            </button>
          ) : savedAt || state.at ? (
            `Saved ${formatMomentDate(savedAt ?? state.at) || ""}${state.by ? ` by ${state.by}` : ""}`
          ) : (
            ""
          )}
        </span>
      </div>

      {canEdit ? (
        <textarea
          value={showing}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          rows={Math.max(TEMPLATE_LINES.length + 1, showing.split("\n").length + 1)}
          spellCheck={false}
          aria-label="Offer details from the hiring manager"
          className="mt-2 w-full resize-y rounded border border-brand-lea/15 bg-white px-2 py-1.5 font-mono text-[12px] leading-[1.7] text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
        />
      ) : (
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[12px] leading-[1.7] text-brand-lea dark:text-slate-100">
          {committed.current || "Nothing recorded yet."}
        </pre>
      )}

      <p className="mt-1.5 text-[11px] text-brand-grey dark:text-slate-400">
        {empty
          ? "Paste what the hiring manager sent straight over these lines. It saves when you click away."
          : "Saves when you click away."}{" "}
        Kept on the offer, so the new hire page shows this same box.
      </p>
    </div>
  );
}

/** Exported for the tests and for whoever strips the pay lines if that changes. */
export const OFFER_DETAIL_LINES = TEMPLATE_LINES;
export const OFFER_DETAIL_PAY_LINES = PAY_LINES;
