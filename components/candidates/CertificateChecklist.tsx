"use client";

import { Fragment, useId, useState } from "react";
import { clsx } from "clsx";
import { Check, Loader, Minus } from "lucide-react";
import { parseTypeRatings } from "@/lib/candidates/aircraft-types";
import {
  buildChecklist,
  CERT_GROUPS,
  CERT_ITEMS,
  serializeCertificates,
  type CertId,
  type ChecklistInput,
  type ChecklistLine,
  type ChecklistView
} from "@/lib/candidates/certificates";

/**
 * The Certificates value as the list a recruiter checks a pilot against —
 * seen, covered, or not seen — instead of one long line of text.
 *
 * "full" is the review column's card (FlightProfilePanel); "compact" is sized
 * for the 330px Screening preview. The reading itself lives in
 * lib/candidates/certificates.ts; this file only draws it.
 *
 * GREY IS NEVER "DOES NOT HOLD". Every line's tooltip says why it is the colour
 * it is: ticked, covered by a higher certificate, not ticked on the signed
 * application, not on the confirmed list, or simply not seen on the scan.
 */

type CertificateChecklistProps = ChecklistInput & {
  variant?: "full" | "compact";
  /** Compact only: add a row of the aircraft from Type Ratings, for places that have no Type Ratings card. */
  showTypes?: boolean;
  className?: string;
};

const STATE_WORD: Record<ChecklistLine["state"], string> = { seen: "seen", covered: "covered", none: "not seen" };

function tooltip(line: ChecklistLine) {
  return `${line.item.full}: ${STATE_WORD[line.state]}. ${line.why}`;
}

/** The small status circle — the one round element here; everything else keeps the 4px corners. */
function Dot({ state }: { state: ChecklistLine["state"] }) {
  return (
    <span
      className={clsx(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
        state === "seen" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
        state === "covered" && "text-emerald-700 ring-1 ring-inset ring-emerald-600 dark:text-emerald-300 dark:ring-emerald-300",
        state === "none" && "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
      )}
    >
      {state === "none" ? <Minus className="h-3 w-3" /> : <Check className={state === "covered" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
    </span>
  );
}

function sourceLine(view: ChecklistView): string {
  const also = view.evidence?.also.length ? `, plus ${view.evidence.also.join(", ")} from other documents` : "";
  if (view.source === "person") {
    const first = view.evidence ? " First read from the signed Pilot Application's boxes." : "";
    return `Confirmed by a person. Grey = not on the confirmed list, not proof they don't hold it.${first}`;
  }
  if (view.source === "form") {
    return `From the ticked boxes on the signed Pilot Application${also}. Grey = not ticked, or not asked there and not seen elsewhere.`;
  }
  return "Read by the scan from the documents' text. Grey = not seen, not proof they don't hold it.";
}

/**
 * What a person had decided before a re-read reopened the value. Shown only
 * while it waits for review: once someone accepts or edits the new list, the
 * old value is history and the card says "Confirmed by a person" instead.
 */
function showWas(view: ChecklistView): boolean {
  return Boolean(view.evidence?.was) && view.source !== "person";
}

function WasNote({ view, compact }: { view: ChecklistView; compact?: boolean }) {
  const was = view.evidence?.was;
  if (!was || !showWas(view)) return null;
  return (
    <p
      className={clsx(
        "rounded border border-amber-300 bg-white/70 text-brand-black dark:border-amber-500/40 dark:bg-white/5 dark:text-slate-200",
        compact ? "px-1.5 py-0.5 text-[10px] leading-4" : "px-2 py-1 text-[10.5px] leading-4"
      )}
    >
      Re-read from the signed Pilot Application —{" "}
      <span className="font-semibold">{was.status === "CONFIRMED" ? "was confirmed as:" : "was dismissed:"}</span>{" "}
      {was.value || "(empty)"}
    </p>
  );
}

function AlsoSeen({ view }: { view: ChecklistView }) {
  if (view.also.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">Also seen</div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {view.also.map((entry) => (
          <span
            key={`${entry.label}|${entry.raw}`}
            title={entry.asWritten ? "Not recognised — shown exactly as written" : `Written as: ${entry.raw}`}
            className={clsx(
              "rounded border px-1.5 text-[10.5px] leading-[15px] text-brand-black/80 dark:text-slate-300",
              entry.asWritten
                ? "border-dashed border-brand-lea/25 font-mono dark:border-white/15"
                : "border-brand-lea/15 bg-white dark:border-white/10 dark:bg-white/5"
            )}
          >
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Full({ view }: { view: ChecklistView }) {
  return (
    <div className="space-y-1.5">
      {view.groups.map(({ group, lines }) => (
        <div key={group.id}>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">{group.label}</div>
          <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
            {lines.map((line) => (
              <li
                key={line.item.id}
                title={tooltip(line)}
                aria-label={tooltip(line)}
                className={clsx(
                  "inline-flex min-w-0 items-center gap-1.5 text-xs",
                  line.state === "seen" && "text-brand-black/80 dark:text-slate-300",
                  line.state === "covered" && "text-emerald-700 dark:text-emerald-300",
                  line.state === "none" && "text-brand-grey dark:text-slate-400"
                )}
              >
                <Dot state={line.state} />
                {/* One wrapping span, so a narrow column folds "Private · by Commercial"
                    onto two lines instead of running past the card's edge. */}
                <span className="min-w-0">
                  {line.item.label}
                  {line.coveredBy ? <span className="text-[10px] text-brand-grey dark:text-slate-400"> · by {line.coveredBy}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <AlsoSeen view={view} />
      <WasNote view={view} />
      <p className="text-[10px] italic leading-4 text-brand-grey dark:text-slate-400">{sourceLine(view)}</p>
    </div>
  );
}

type TypeChip = { label: string; asWritten: boolean };

function Compact({ view, types }: { view: ChecklistView; types: TypeChip[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Certificates</span>
        {view.total > 0 ? (
          <span className="shrink-0 text-[10px] text-brand-grey dark:text-slate-400">
            {view.seen} of {view.total} seen
          </span>
        ) : null}
      </div>
      <div className="mt-1 grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1">
        {view.groups.map(({ group, lines }) => (
          <Fragment key={group.id}>
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-brand-grey dark:text-slate-400">{group.short}</span>
            <span className="flex flex-wrap gap-[3px]">
              {lines.map((line) => (
                <span
                  key={line.item.id}
                  title={tooltip(line)}
                  aria-label={tooltip(line)}
                  className={clsx(
                    "rounded border px-1 text-[10px] font-semibold leading-[15px] tracking-[0.02em]",
                    line.state === "seen" && "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                    line.state === "covered" && "border-emerald-600 text-emerald-700 dark:border-emerald-300 dark:text-emerald-300",
                    line.state === "none" && "border-dashed border-brand-lea/25 text-brand-grey dark:border-white/15 dark:text-slate-400"
                  )}
                >
                  {line.item.short}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
        {types.length > 0 ? (
          <>
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-brand-grey dark:text-slate-400">Types</span>
            <span className="flex flex-wrap gap-[3px]">
              {types.map((type) => (
                <span
                  key={type.label}
                  title={type.asWritten ? "Not a type this app recognises yet — shown exactly as written" : undefined}
                  className={clsx(
                    "rounded border px-1 font-mono text-[10px] leading-[15px] text-brand-lea dark:text-slate-100",
                    type.asWritten ? "border-dashed border-brand-lea/25 dark:border-white/15" : "border-brand-lea/15 dark:border-white/10"
                  )}
                >
                  {type.label}
                </span>
              ))}
            </span>
          </>
        ) : null}
      </div>
      {view.also.length > 0 ? (
        <p className="mt-1 text-[10px] leading-4 text-brand-grey dark:text-slate-400">
          <span className="font-semibold">Also:</span> {view.also.map((entry) => entry.label).join(" · ")}
        </p>
      ) : null}
      {showWas(view) ? (
        <div className="mt-1">
          <WasNote view={view} compact />
        </div>
      ) : null}
      <p className="mt-1 text-[9.5px] italic leading-4 text-brand-grey dark:text-slate-400">
        {view.source === "person"
          ? "Confirmed by a person"
          : view.source === "form"
            ? "From the signed Pilot Application's ticked boxes"
            : "Read from the documents' text · grey = not seen"}
      </p>
    </div>
  );
}

/**
 * Compact usage (the Screening preview), with the fields getCandidatePreview returns:
 *
 *   <CertificateChecklist variant="compact" showTypes
 *     certificates={preview.certificates?.value} status={preview.certificates?.status}
 *     evidence={preview.certificates?.evidence} typeRatings={preview.typeRatings} />
 *
 * Renders nothing when there is no certificates value.
 */
export function CertificateChecklist({ variant = "full", showTypes, className, ...input }: CertificateChecklistProps) {
  const view = buildChecklist(input);
  if (view.groups.length === 0 && view.also.length === 0) return null;
  let types: TypeChip[] = [];
  if (variant === "compact" && showTypes && input.typeRatings) {
    // An aircraft the reference list has not met is kept, as written — the same
    // rule the Type column follows. Only licences and seats are left out.
    const parsed = parseTypeRatings(input.typeRatings);
    types = [
      ...parsed.types.map((label) => ({ label, asWritten: false })),
      ...parsed.unknown.map((label) => ({ label, asWritten: true }))
    ];
  }
  return <div className={className}>{variant === "compact" ? <Compact view={view} types={types} /> : <Full view={view} />}</div>;
}

type CertificateTickEditorProps = ChecklistInput & {
  saveLabel: string;
  busy?: boolean;
  /** Receives the new value as plain text, ready for the metric's valueText. */
  onSave: (valueText: string) => void;
  onCancel: () => void;
};

/**
 * Editing is ticking boxes, not retyping a comma list. Covered lines are not
 * ticked here — they follow from what is (an ATP covers Commercial, Private and
 * Instrument). Anything that is not a line stays editable as text.
 */
export function CertificateTickEditor({ saveLabel, busy, onSave, onCancel, ...input }: CertificateTickEditorProps) {
  const alsoId = useId();
  const [start] = useState(() => {
    const view = buildChecklist(input);
    const families = view.families.length > 0 ? view.families : (["pilot"] as const);
    const groups = CERT_GROUPS.filter((group) => (families as readonly string[]).includes(group.family));
    const editable = new Set<CertId>(groups.flatMap((group) => [...group.items, ...(group.onlyWhenSeen ?? [])]));
    return {
      groups,
      ticked: new Set([...view.found].filter((id) => editable.has(id))),
      // Extras keep the candidate's own words, so saving them changes nothing.
      also: view.also.map((entry) => entry.raw).filter(Boolean).join(", ")
    };
  });
  const [ticked, setTicked] = useState<Set<CertId>>(start.ticked);
  const [also, setAlso] = useState(start.also);

  function toggle(id: CertId) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-1.5">
      {start.groups.map((group) => (
        <div key={group.id}>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">{group.label}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {[...group.items, ...(group.onlyWhenSeen ?? [])].map((id) => {
              const on = ticked.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(id)}
                  title={CERT_ITEMS[id].full}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold transition hover:shadow-glow",
                    on
                      ? "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "border-dashed border-brand-lea/25 bg-white text-brand-grey dark:border-white/15 dark:bg-transparent dark:text-slate-400"
                  )}
                >
                  {on ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {CERT_ITEMS[id].label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <label htmlFor={alsoId} className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">
          Also seen, as written
        </label>
        <input
          id={alsoId}
          value={also}
          onChange={(e) => setAlso(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          placeholder="e.g. Glider, Tailwheel endorsement"
          className="mt-0.5 w-full rounded border border-brand-lea/30 px-1.5 py-0.5 text-xs text-brand-lea focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
        />
      </div>
      {start.groups.some((group) => group.family === "pilot") ? (
        <p className="text-[10px] leading-4 text-brand-grey dark:text-slate-400">
          Covered lines follow on their own: an ATP covers Commercial, Private and Instrument; Commercial covers Private; CFII and MEI cover CFI.
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => onSave(serializeCertificates(ticked, also))}
          disabled={busy}
          className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-grey dark:border-white/10 dark:text-slate-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
