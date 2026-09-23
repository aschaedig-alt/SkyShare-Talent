"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { AlertTriangle, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import { saveRequirementRole } from "@/app/recruiting-jobs/requirement-actions";
import type { JobRequirementView } from "@/lib/data/pilot-requirements";

// The Role block on a Pilot requirement tab: fleet position, operator, seat,
// aircraft, base and pay — and THE ONLY PLACE seat, aircraft and base are edited
// for a job that has a requirement. Its save writes the job and the requirement
// in one transaction (saveRequirementRole), which is what stops the two copies
// drifting apart the way they had.
//
// A pair that ALREADY disagrees is not reconciled for anyone. Both values are
// shown, and before a save can touch both rows the person picks which one is
// right, field by field. The existing disagreements are live data and only a
// person who knows the role can say which side is correct.

const CARD = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400";
const INPUT =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-1.5 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 disabled:opacity-60 dark:border-white/10 dark:bg-brand-field dark:text-slate-100";
const CHIP = "inline-flex items-center gap-1 rounded border border-brand-sweet/60 bg-brand-sweet/20 px-2 py-0.5 text-xs font-semibold text-brand-lea dark:border-white/15 dark:bg-white/10 dark:text-slate-100";

// The seats the requirement schema accepts (lib/validation/pilot-requirement.ts).
const SEATS = ["PIC", "SIC", "Lead PIC", "Chief Pilot", "Assistant Chief Pilot", "Mixed"];

type Synced = "seat" | "aircraft" | "base";
const SYNCED_LABEL: Record<Synced, string> = { seat: "seat", aircraft: "aircraft", base: "base" };

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The distinct aircraft, with the other spellings the importer stored alongside
 * them ("Gulfstream G450, GV, G450, G550, Gulfstream, 450, ...") folded under the
 * first entry that already contains them. Display only: the stored list, which is
 * what scoring reads, is untouched and is what the editor shows in full.
 */
function splitAircraft(list: string[]) {
  const primary: string[] = [];
  const also: string[] = [];
  for (const item of list) {
    const key = norm(item);
    if (!key) continue;
    if (primary.some((kept) => norm(kept).includes(key))) also.push(item);
    else primary.push(item);
  }
  return { primary, also };
}

function location(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(", ");
}

function baseLine(airport: string | null, city: string | null, state: string | null) {
  return [airport, location(city, state)].filter(Boolean).join(" – ");
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-brand-grey/70 dark:text-slate-500">{children}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className={clsx(LABEL, "pt-0.5")}>{label}</dt>
      <dd className="min-w-0 break-words text-sm text-brand-lea dark:text-slate-100">{children}</dd>
    </>
  );
}

type Draft = {
  operatorType: string;
  pilotSeat: string;
  aircraft: string[];
  baseAirport: string;
  baseCity: string;
  baseState: string;
  payScaleRaw: string;
  note: string;
};

function draftFrom(requirement: JobRequirementView): Draft {
  return {
    operatorType: requirement.operatorType ?? "",
    pilotSeat: requirement.pilotSeat ?? "",
    aircraft: requirement.aircraftTypes,
    baseAirport: requirement.baseAirport ?? "",
    baseCity: requirement.baseCity ?? "",
    baseState: requirement.baseState ?? "",
    payScaleRaw: requirement.payScaleRaw ?? "",
    note: ""
  };
}

export function RequirementRoleBlock({
  requirement,
  pageJobId,
  canEdit,
  canEditFleetPosition
}: {
  requirement: JobRequirementView;
  /** The job page this sits on, or null on a no-job requirement's page. */
  pageJobId: string | null;
  canEdit: boolean;
  /** The fleet position has its own editor, under Edit requirement. */
  canEditFleetPosition: boolean;
}) {
  const router = useRouter();
  const pair = requirement.pair;
  const differing = (Object.keys(SYNCED_LABEL) as Synced[]).filter((field) => pair?.differs[field]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(requirement));
  const [chosen, setChosen] = useState<Partial<Record<Synced, "job" | "requirement">>>({});
  const [newAircraft, setNewAircraft] = useState("");
  const [pending, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const unresolved = differing.filter((field) => !chosen[field]);
  const { primary, also } = splitAircraft(requirement.aircraftTypes);

  function open() {
    setDraft(draftFrom(requirement));
    setChosen({});
    setNewAircraft("");
    setError(null);
    setNotice(null);
    setEditing(true);
  }

  function choose(field: Synced, side: "job" | "requirement") {
    if (!pair) return;
    setChosen((current) => ({ ...current, [field]: side }));
    setDraft((current) => {
      if (field === "seat") {
        return { ...current, pilotSeat: (side === "job" ? pair.seat : requirement.pilotSeat) ?? "" };
      }
      if (field === "aircraft") {
        return { ...current, aircraft: side === "job" ? pair.aircraftTypes : requirement.aircraftTypes };
      }
      // Base: the job holds only a city and state. The airport is the requirement's
      // either way, since the job has none to offer.
      return {
        ...current,
        baseCity: (side === "job" ? pair.city : requirement.baseCity) ?? "",
        baseState: (side === "job" ? pair.state : requirement.baseState) ?? ""
      };
    });
  }

  function addAircraft() {
    const value = newAircraft.trim();
    if (value && !draft.aircraft.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setDraft((current) => ({ ...current, aircraft: [...current.aircraft, value] }));
    }
    setNewAircraft("");
  }

  function save() {
    setError(null);
    setNotice(null);
    startSave(async () => {
      const result = await saveRequirementRole({
        requirementId: requirement.id,
        jobId: pageJobId,
        operatorType: draft.operatorType || null,
        pilotSeat: draft.pilotSeat || null,
        aircraftTypes: draft.aircraft,
        baseAirport: draft.baseAirport,
        baseCity: draft.baseCity,
        baseState: draft.baseState,
        payScaleRaw: draft.payScaleRaw,
        note: draft.note
      });
      if (!result.ok) {
        setError(result.error ?? "Could not save the role.");
        return;
      }
      setEditing(false);
      setNotice(result.unchanged ? "Nothing had changed, so nothing was saved." : pair ? "Saved to the job and its requirement." : "Saved.");
      router.refresh();
    });
  }

  const savesWhere = pair
    ? "Seat, aircraft and base are saved to this job and its requirement together, so the two cannot drift apart. Operator and pay belong to the requirement."
    : requirement.link === "merged"
      ? `This requirement came from “${requirement.mergedFromJobTitle ?? "another job"}”, which was merged into this job, so saving here changes the requirement only.`
      : "This requirement has no job, so saving here changes the requirement only.";

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={EYEBROW}>Role</p>
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Seat, aircraft, base and pay</h3>
        </div>
        {canEdit && !editing ? (
          <Button variant="secondary" size="sm" onClick={open}>
            <Pencil className="h-3.5 w-3.5" /> {differing.length > 0 ? "Choose which is right" : "Edit role"}
          </Button>
        ) : null}
      </div>

      {pair && differing.length > 0 && !editing ? (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This job and its requirement disagree on {differing.map((field) => SYNCED_LABEL[field]).join(" and ")}.
          </p>
          <p className="mt-1 text-xs">
            The Matchboard and screening score from the requirement; the job list and this page&apos;s header show the
            job&apos;s copy. Nothing has been changed on either. {canEdit ? "Choose which is right and it is saved to both." : ""}
          </p>
          <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs [grid-template-columns:auto_1fr]">
            {differing.map((field) => (
              <DiffLine key={field} field={field} requirement={requirement} />
            ))}
          </dl>
        </div>
      ) : null}

      {notice ? <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">{notice}</p> : null}

      {!editing ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <dl className="grid gap-x-4 gap-y-2 [grid-template-columns:minmax(96px,auto)_1fr]">
            <Row label="Fleet position">
              {requirement.positionTitle ? (
                <>
                  {requirement.positionTitle}
                  {requirement.positionChosen ? null : (
                    <span className="ml-1.5 text-xs text-brand-grey dark:text-slate-400">(matched from the title)</span>
                  )}
                </>
              ) : (
                <Missing>Not set, and the title does not match one</Missing>
              )}
            </Row>
            <Row label="Operator">{requirement.operatorType ?? <Missing>Not set</Missing>}</Row>
            <Row label="Seat">{requirement.pilotSeat ?? <Missing>Not set</Missing>}</Row>
            <Row label="Base">
              {baseLine(requirement.baseAirport, requirement.baseCity, requirement.baseState) || <Missing>Not set</Missing>}
            </Row>
            <Row label="Pay">{requirement.payScaleRaw ?? <Missing>Not recorded</Missing>}</Row>
            {requirement.advertisedTitle ? <Row label="Advertised as">{requirement.advertisedTitle}</Row> : null}
            {requirement.linkedPositions.length > 0 ? (
              <Row label="Also covers">{requirement.linkedPositions.map((position) => position.title).join(", ")}</Row>
            ) : null}
          </dl>

          <div>
            <p className={LABEL}>Aircraft</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {primary.length > 0 ? primary.map((item) => <span key={item} className={CHIP}>{item}</span>) : <Missing>None set</Missing>}
            </div>
            {also.length > 0 ? (
              <>
                <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">
                  Also stored as {also.length} other spelling{also.length === 1 ? "" : "s"}, which scoring reads too:
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {also.map((item) => (
                    <span
                      key={item}
                      className="rounded border border-dashed border-brand-lea/25 px-2 py-0.5 text-xs text-brand-grey dark:border-white/20 dark:text-slate-400"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {differing.length > 0 ? (
            <div className="space-y-2">
              {differing.map((field) =>
                chosen[field] ? null : (
                  <div
                    key={field}
                    className="rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"
                  >
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      The {SYNCED_LABEL[field]} differs. Which is right?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ChoiceButton label="The job's" value={valueOf(field, "job", requirement)} onClick={() => choose(field, "job")} />
                      <ChoiceButton
                        label="The requirement's"
                        value={valueOf(field, "requirement", requirement)}
                        onClick={() => choose(field, "requirement")}
                      />
                    </div>
                  </div>
                )
              )}
            </div>
          ) : null}

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
            <label className="block">
              <span className={LABEL}>Operator</span>
              <select
                className={clsx(INPUT, "mt-1")}
                value={draft.operatorType}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, operatorType: event.target.value })}
              >
                <option value="">Not set</option>
                <option value="SkyShare">SkyShare</option>
                <option value="Managed">Managed</option>
              </select>
            </label>
            {!differing.includes("seat") || chosen.seat ? (
              <label className="block">
                <span className={LABEL}>Seat</span>
                <select
                  className={clsx(INPUT, "mt-1")}
                  value={draft.pilotSeat}
                  disabled={pending}
                  onChange={(event) => setDraft({ ...draft, pilotSeat: event.target.value })}
                >
                  <option value="">Not set</option>
                  {/* A stored seat outside the list stays selectable rather than
                      silently turning into "Not set". */}
                  {[...new Set([...SEATS, ...(draft.pilotSeat ? [draft.pilotSeat] : [])])].map((seat) => (
                    <option key={seat} value={seat}>
                      {seat}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!differing.includes("base") || chosen.base ? (
              <>
                <label className="block">
                  <span className={LABEL}>Base airport</span>
                  <input
                    className={clsx(INPUT, "mt-1")}
                    value={draft.baseAirport}
                    disabled={pending}
                    placeholder="SLC"
                    onChange={(event) => setDraft({ ...draft, baseAirport: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>Base city</span>
                  <input
                    className={clsx(INPUT, "mt-1")}
                    value={draft.baseCity}
                    disabled={pending}
                    onChange={(event) => setDraft({ ...draft, baseCity: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>Base state</span>
                  <input
                    className={clsx(INPUT, "mt-1")}
                    value={draft.baseState}
                    disabled={pending}
                    onChange={(event) => setDraft({ ...draft, baseState: event.target.value })}
                  />
                </label>
              </>
            ) : null}
          </div>

          {!differing.includes("aircraft") || chosen.aircraft ? (
            <div>
              <span className={LABEL}>Aircraft</span>
              <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                Every spelling here is matched against candidates&apos; experience.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {draft.aircraft.length === 0 ? <Missing>None</Missing> : null}
                {draft.aircraft.map((item) => (
                  <span key={item} className={CHIP}>
                    {item}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setDraft({ ...draft, aircraft: draft.aircraft.filter((entry) => entry !== item) })}
                      aria-label={`Remove ${item}`}
                      className="rounded text-brand-grey transition hover:text-red-700 disabled:opacity-60 dark:text-slate-400 dark:hover:text-red-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex max-w-md gap-2">
                <input
                  className={INPUT}
                  value={newAircraft}
                  disabled={pending}
                  placeholder="Add an aircraft, e.g. Citation CJ2"
                  onChange={(event) => setNewAircraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addAircraft();
                    }
                  }}
                />
                <Button variant="secondary" size="sm" onClick={addAircraft} disabled={pending || !newAircraft.trim()}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <label className="block">
              <span className={LABEL}>Pay</span>
              <input
                className={clsx(INPUT, "mt-1")}
                value={draft.payScaleRaw}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, payScaleRaw: event.target.value })}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Change note (optional)</span>
              <input
                className={clsx(INPUT, "mt-1")}
                value={draft.note}
                disabled={pending}
                placeholder="Why, for the change history"
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              />
            </label>
          </div>

          {error ? (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={pending || unresolved.length > 0}>
              {pending ? "Saving…" : pair ? "Save to the job and its requirement" : "Save"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
            {unresolved.length > 0 ? (
              <span className="text-xs text-brand-grey dark:text-slate-400">
                Choose which {unresolved.map((field) => SYNCED_LABEL[field]).join(" and ")} is right first.
              </span>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-3 border-t border-brand-lea/10 pt-2 text-xs text-brand-grey dark:border-white/10 dark:text-slate-400">
        {savesWhere}
        {canEditFleetPosition ? " The fleet position is changed under Edit requirement." : ""}
      </p>
    </section>
  );
}

function valueOf(field: Synced, side: "job" | "requirement", requirement: JobRequirementView): string {
  const pair = requirement.pair;
  if (!pair) return "";
  if (field === "seat") return (side === "job" ? pair.seat : requirement.pilotSeat) ?? "Not set";
  if (field === "aircraft") {
    const list = side === "job" ? pair.aircraftTypes : requirement.aircraftTypes;
    return list.length > 0 ? list.join(", ") : "None";
  }
  return (
    (side === "job"
      ? location(pair.city, pair.state)
      : baseLine(requirement.baseAirport, requirement.baseCity, requirement.baseState)) || "Not set"
  );
}

function DiffLine({ field, requirement }: { field: Synced; requirement: JobRequirementView }) {
  return (
    <>
      <dt className="font-semibold capitalize">{SYNCED_LABEL[field]}</dt>
      <dd>
        Job: <span className="font-semibold">{valueOf(field, "job", requirement)}</span>
        <span aria-hidden className="mx-1.5 opacity-50">
          ·
        </span>
        Requirement: <span className="font-semibold">{valueOf(field, "requirement", requirement)}</span>
      </dd>
    </>
  );
}

function ChoiceButton({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex max-w-full flex-col items-start rounded border border-brand-lea/20 bg-white px-3 py-2 text-left transition hover:border-brand-gold hover:shadow-glow dark:border-white/15 dark:bg-brand-panel"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</span>
      <span className="break-words text-sm font-semibold text-brand-lea dark:text-slate-100">{value}</span>
    </button>
  );
}
