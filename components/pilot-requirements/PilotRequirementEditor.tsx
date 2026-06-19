"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PilotRequirementDetail } from "@/lib/data/pilot-requirements";

type PilotRequirementEditorProps = {
  requirement: PilotRequirementDetail;
};

type GateFormValue = {
  id: string;
  key: string;
  label: string;
  category: string;
  valueType: string;
  enabled: boolean;
  numericValue: string;
  textValue: string;
  evidenceText: string;
};

const inputClass =
  "w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition placeholder:text-brand-grey/70 focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100";

const selectClass = inputClass;

function flattenGates(requirement: PilotRequirementDetail): GateFormValue[] {
  return requirement.editableGatesByCategory.flatMap((group) =>
    group.gates.map((gate) => ({
      id: gate.id,
      key: gate.key,
      label: gate.label,
      category: gate.category,
      valueType: gate.valueType,
      enabled: gate.enabled,
      numericValue: typeof gate.numericValue === "number" ? String(gate.numericValue) : "",
      textValue: gate.textValue ?? "",
      evidenceText: gate.evidenceText ?? ""
    }))
  );
}

function groupGates(gates: GateFormValue[]) {
  const groups = new Map<string, GateFormValue[]>();
  for (const gate of gates) {
    const group = groups.get(gate.category) ?? [];
    group.push(gate);
    groups.set(gate.category, group);
  }

  return Array.from(groups.entries()).map(([category, group]) => ({ category, gates: group }));
}

export function PilotRequirementEditor({ requirement }: PilotRequirementEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(requirement.title);
  const [status, setStatus] = useState(requirement.status);
  const [reviewStatus, setReviewStatus] = useState(requirement.reviewStatus);
  const [operatorType, setOperatorType] = useState(requirement.operatorType ?? "Managed");
  const [pilotSeat, setPilotSeat] = useState(requirement.pilotSeat ?? "PIC");
  const [baseCity, setBaseCity] = useState(requirement.baseCity ?? "");
  const [baseState, setBaseState] = useState(requirement.baseState ?? "");
  const [baseAirport, setBaseAirport] = useState(requirement.baseAirport ?? "");
  const [payScaleRaw, setPayScaleRaw] = useState(requirement.payScaleRaw ?? "");
  const [manualOverrideNotes, setManualOverrideNotes] = useState("");
  const [gates, setGates] = useState(() => flattenGates(requirement));
  const groupedGates = useMemo(() => groupGates(gates), [gates]);

  function updateGate(id: string, patch: Partial<GateFormValue>) {
    setGates((current) => current.map((gate) => (gate.id === id ? { ...gate, ...patch } : gate)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const payload = {
      title,
      status,
      reviewStatus,
      operatorType,
      pilotSeat,
      baseCity,
      baseState,
      baseAirport,
      payScaleRaw,
      manualOverrideNotes,
      gates: gates.map((gate) => ({
        id: gate.id,
        enabled: gate.enabled,
        numericValue: gate.numericValue,
        textValue: gate.textValue,
        evidenceText: gate.evidenceText
      }))
    };

    startTransition(async () => {
      try {
        const response = await fetch(`/api/pilot-requirements/${requirement.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const result = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(result.message ?? "Unable to save pilot requirement.");
        }

        setMessage(result.message ?? "Pilot requirement saved.");
        router.refresh();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Unable to save pilot requirement.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
              Requirement editor
            </p>
            <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Role identity</h3>
            <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
              Save updates to the structured requirement profile. Original source text remains preserved.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {message ? (
              <span className="rounded bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                {message}
              </span>
            ) : null}
            {error ? (
              <span className="rounded bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
                {error}
              </span>
            ) : null}
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save requirement"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 xl:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Requirement name</span>
            <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Status</span>
            <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
              {["ACTIVE", "INACTIVE", "HISTORICAL", "RETIRED", "EVERGREEN", "ARCHIVED"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Review status</span>
            <select className={selectClass} value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}>
              {["DRAFT", "NEEDS_REVIEW", "READY_FOR_REVIEW", "APPROVED"].map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Operator</span>
            <select className={selectClass} value={operatorType} onChange={(event) => setOperatorType(event.target.value)}>
              <option value="Managed">Managed</option>
              <option value="SkyShare">SkyShare</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Seat</span>
            <select className={selectClass} value={pilotSeat} onChange={(event) => setPilotSeat(event.target.value)}>
              {["PIC", "SIC", "Lead PIC", "Chief Pilot", "Assistant Chief Pilot", "Mixed"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Base city</span>
            <input className={inputClass} value={baseCity} onChange={(event) => setBaseCity(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Base state</span>
            <input className={inputClass} value={baseState} onChange={(event) => setBaseState(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Base airport</span>
            <input className={inputClass} value={baseAirport} onChange={(event) => setBaseAirport(event.target.value)} />
          </label>
          <label className="space-y-1 xl:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Pay scale</span>
            <input className={inputClass} value={payScaleRaw} onChange={(event) => setPayScaleRaw(event.target.value)} />
          </label>
          <label className="space-y-1 xl:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">Change note</span>
            <input
              className={inputClass}
              value={manualOverrideNotes}
              onChange={(event) => setManualOverrideNotes(event.target.value)}
              placeholder="Optional note for change history"
            />
          </label>
        </div>
      </section>

      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
              Editable gates
            </p>
            <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Turn requirements on/off and adjust hours</h3>
          </div>
          <span className="rounded bg-brand-cloudDancer px-3 py-1 text-xs font-semibold text-brand-eden dark:bg-white/5">
            {gates.filter((gate) => gate.enabled).length} enabled
          </span>
        </div>

        <div className="mt-4 space-y-4">
          {groupedGates.map((group) => (
            <div key={group.category}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">
                {group.category}
              </div>
              <div className="grid gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                {group.gates.map((gate) => (
                  <div key={gate.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={gate.enabled}
                        onChange={(event) => updateGate(gate.id, { enabled: event.target.checked })}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-brand-lea dark:text-slate-100">{gate.label}</span>
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">
                          {gate.valueType}
                        </span>
                      </span>
                    </label>
                    {gate.valueType === "hours" ? (
                      <input
                        className={`${inputClass} mt-2`}
                        inputMode="numeric"
                        value={gate.numericValue}
                        onChange={(event) => updateGate(gate.id, { numericValue: event.target.value })}
                        placeholder="hours"
                      />
                    ) : (
                      <input
                        className={`${inputClass} mt-2`}
                        value={gate.textValue}
                        onChange={(event) => updateGate(gate.id, { textValue: event.target.value })}
                        placeholder="Optional detail"
                      />
                    )}
                    <textarea
                      className={`${inputClass} mt-2 min-h-[72px]`}
                      value={gate.evidenceText}
                      onChange={(event) => updateGate(gate.id, { evidenceText: event.target.value })}
                      placeholder="Evidence or notes"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </form>
  );
}
