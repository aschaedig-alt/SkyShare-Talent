"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { ONBOARDING_GROUPS, groupLabel } from "@/lib/onboarding/tasks";
import type { NewHireDetail, TaskView } from "@/lib/data/onboarding";
import { TravelPanel } from "@/components/travel/TravelPanel";
import type { TravelTripView, TravelerLoyalty } from "@/lib/data/travel";
import { EmployeeJourney } from "@/components/people/EmployeeJourney";
import { BusinessCardPanel } from "@/components/people/BusinessCardPanel";
import type { EmployeeJourney as Journey } from "@/lib/data/employee-journey";
import { Button, Input, Modal } from "@/components/ui";
import { EMPLOYEE_TAGS } from "@/lib/employees/columns";
import { tagStyle, TagPill, displayTags } from "@/components/employees/EmployeeTags";

function fmtDay(iso: string | null) {
  // Dates are stored as date-only (UTC midnight); format in UTC so the calendar
  // day doesn't shift back a day in negative-offset timezones.
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "";
}

type Props = {
  hire: NewHireDetail;
  travelTrips: TravelTripView[];
  travelLoyalty: TravelerLoyalty;
  journey: Journey;
  roleTitleOptions: string[];
};

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

const STATUS_BTN: Record<TaskView["status"], { label: string; on: string }> = {
  DONE: { label: "Done", on: "bg-emerald-500 text-white" },
  TODO: { label: "To do", on: "bg-brand-lea text-white" },
  NA: { label: "N/A", on: "bg-brand-grey text-white" }
};

export function NewHireDetailWorkspace({ hire, travelTrips, travelLoyalty, journey, roleTitleOptions }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskView[]>(hire.tasks);
  const [details, setDetails] = useState({
    name: hire.name,
    legalName: hire.legalName ?? "",
    position: hire.position ?? "",
    department: hire.department ?? "",
    location: hire.location ?? "",
    managedAircraft: hire.managedAircraft ?? "",
    phone: hire.phone ?? "",
    ssEmail: hire.ssEmail ?? "",
    personalEmail: hire.personalEmail ?? "",
    offerSentDate: toDateInput(hire.offerSentDate),
    offerSignedDate: toDateInput(hire.offerSignedDate),
    startDate: toDateInput(hire.startDate),
    orientationDate: toDateInput(hire.orientationDate),
    aircraftServiceDate: toDateInput(hire.aircraftServiceDate),
    seniorityDate: toDateInput(hire.seniorityDate),
    birthCountry: hire.birthCountry ?? "",
    citizenshipCountry: hire.citizenshipCountry ?? "",
    notes: hire.notes ?? ""
  });
  const [hasLegalName, setHasLegalName] = useState(Boolean(hire.legalName));
  const [managedPilot, setManagedPilot] = useState(hire.managedPilot);
  const [tags, setTags] = useState<string[]>(hire.tags ?? []);
  const [savingDetails, setSavingDetails] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [termDate, setTermDate] = useState("");
  const [busyEmp, setBusyEmp] = useState(false);

  const terminated = hire.employmentStatus === "TERMINATED";

  async function setEmployment(employmentStatus: "ACTIVE" | "TERMINATED", terminationDate?: string) {
    setBusyEmp(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/new-hires/${hire.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employmentStatus, ...(terminationDate !== undefined ? { terminationDate } : {}) })
      });
      if (!res.ok) throw new Error();
      setTermOpen(false);
      router.refresh();
    } catch {
      setStatus("Could not update employment status.");
    } finally {
      setBusyEmp(false);
    }
  }

  function openTerminate() {
    const today = new Date();
    setTermDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
    setStatus(null);
    setTermOpen(true);
  }

  const applicable = tasks.filter((t) => t.status !== "NA");
  const doneCount = applicable.filter((t) => t.status === "DONE").length;
  const pct = applicable.length > 0 ? Math.round((doneCount / applicable.length) * 100) : 0;

  const grouped = useMemo(
    () => ONBOARDING_GROUPS.map((g) => ({ group: g, items: tasks.filter((t) => t.group === g.key).sort((a, b) => a.order - b.order) })),
    [tasks]
  );

  async function setTaskStatus(taskId: string, next: TaskView["status"]) {
    const prev = tasks;
    setTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, status: next } : t)));
    try {
      const res = await fetch(`/api/onboarding-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) throw new Error();
    } catch {
      setTasks(prev);
      setStatus("Could not save that task. Try again.");
    }
  }

  async function saveDetails() {
    setSavingDetails(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/new-hires/${hire.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details)
      });
      if (!res.ok) throw new Error();
      setStatus("Details saved.");
      router.refresh();
    } catch {
      setStatus("Could not save details.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveManagedPilot(next: boolean) {
    const prev = managedPilot;
    setManagedPilot(next);
    try {
      const res = await fetch(`/api/new-hires/${hire.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managedPilot: next })
      });
      if (!res.ok) setManagedPilot(prev);
      else router.refresh();
    } catch {
      setManagedPilot(prev);
    }
  }

  async function saveTags(next: string[]) {
    const prev = tags;
    setTags(next);
    try {
      const res = await fetch(`/api/new-hires/${hire.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next })
      });
      if (!res.ok) setTags(prev);
      else router.refresh();
    } catch {
      setTags(prev);
    }
  }
  const toggleTag = (t: string) => saveTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  async function changeStage(stage: "ACTIVE" | "POST_ONBOARD" | "ARCHIVED") {
    setBusyStage(true);
    try {
      const res = await fetch(`/api/new-hires/${hire.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage })
      });
      if (!res.ok) throw new Error();
      router.push(stage === "ACTIVE" ? "/people?stage=active" : stage === "POST_ONBOARD" ? "/people?stage=post" : "/people?stage=archived");
    } catch {
      setStatus("Could not change stage.");
      setBusyStage(false);
    }
  }

  function field(label: string, key: keyof typeof details, type: "text" | "date" = "text") {
    return (
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</span>
        <input
          type={type}
          value={details[key]}
          onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
          className="mt-1 w-full rounded border border-brand-lea/15 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:text-slate-100"
        />
      </label>
    );
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <Link
        href={hire.stage === "ACTIVE" ? "/people" : "/employees"}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400"
      >
        ← {hire.stage === "ACTIVE" ? "Pre-onboarding" : "Employees"}
      </Link>

      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{hire.name}</h1>
            {displayTags(tags, hire.employmentStatus).map((t) => <TagPill key={t} tag={t} />)}
            {hire.tenureYears > 0 ? (
              <span
                title={`${hire.tenureYears} year${hire.tenureYears === 1 ? "" : "s"} with SkyShare`}
                aria-label={`${hire.tenureYears} year${hire.tenureYears === 1 ? "" : "s"} of service`}
                className="select-none text-xl font-bold leading-none tracking-tight text-brand-gold"
              >
                {"*".repeat(hire.tenureYears)}
              </span>
            ) : null}
          </div>
          {hire.legalName ? (
            <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">Legal name: {hire.legalName}</p>
          ) : null}
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            {hire.position ?? "Position not set"}
            {hire.department ? ` · ${hire.department}` : ""}
          </p>
          {terminated ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-brand-grey/15 px-2.5 py-0.5 text-xs font-semibold text-brand-grey dark:bg-white/10 dark:text-slate-300">
              Former employee{hire.terminationDate ? ` · left ${fmtDay(hire.terminationDate)}` : ""}
            </span>
          ) : null}
          <div className="mt-2 flex items-center gap-3">
            <span className="h-2 w-40 overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/5">
              <span className={clsx("block h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-brand-gold")} style={{ width: `${pct}%` }} />
            </span>
            <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">
              {doneCount}/{applicable.length} done
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {terminated ? (
            <button onClick={() => setEmployment("ACTIVE")} disabled={busyEmp} className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
              {busyEmp ? "Saving…" : "Mark as active"}
            </button>
          ) : (
            <>
              {hire.stage !== "ACTIVE" && (
                <button onClick={() => changeStage("ACTIVE")} disabled={busyStage} className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
                  Reactivate
                </button>
              )}
              {hire.stage === "ACTIVE" && (
                <button onClick={() => changeStage("POST_ONBOARD")} disabled={busyStage} className="rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
                  Mark onboarded
                </button>
              )}
              {hire.stage !== "ARCHIVED" && (
                <button onClick={() => changeStage("ARCHIVED")} disabled={busyStage} className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:bg-white/5">
                  Archive
                </button>
              )}
              <button onClick={openTerminate} disabled={busyEmp} className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10">
                Mark as former employee
              </button>
            </>
          )}
        </div>
      </section>

      {status ? <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{status}</div> : null}

      <Modal open={termOpen} onClose={() => setTermOpen(false)} busy={busyEmp}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Mark as former employee</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Moves {hire.name} to Past employees. Their current role and employment period are closed on the last day below. You can reverse this anytime with “Mark as active.”
        </p>
        <label className="mt-4 block">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Last day</span>
          <Input type="date" value={termDate} onChange={(e) => setTermDate(e.target.value)} className="mt-1" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setTermOpen(false)} disabled={busyEmp}>Cancel</Button>
          <Button variant="danger" onClick={() => setEmployment("TERMINATED", termDate)} disabled={busyEmp || !termDate}>
            {busyEmp ? "Saving…" : "Mark as former"}
          </Button>
        </div>
      </Modal>

      <EmployeeJourney hireId={hire.id} journey={journey} roleTitleOptions={roleTitleOptions} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
        {/* Details */}
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Details</h2>
            <button onClick={saveDetails} disabled={savingDetails} className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
              {savingDetails ? "Saving..." : "Save"}
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {field("Name", "name")}
            <label className="flex items-center gap-1.5 text-xs text-brand-grey dark:text-slate-400">
              <input
                type="checkbox"
                checked={hasLegalName}
                onChange={(e) => {
                  setHasLegalName(e.target.checked);
                  if (!e.target.checked) setDetails((d) => ({ ...d, legalName: "" }));
                }}
              />
              Goes by a different name (add legal name)
            </label>
            {hasLegalName ? field("Legal name", "legalName") : null}
            {field("Position", "position")}
            {field("Department", "department")}
            {field("Job location", "location")}
            {(details.department.toLowerCase().includes("managed") || details.managedAircraft) ? field("Managed aircraft (tail #)", "managedAircraft") : null}
            {/\b(captain|first officer|\bfo\b|\bpic\b|\bsic\b|pilot)\b/i.test(details.position) || managedPilot ? (
              <label className="flex items-start gap-2 text-xs text-brand-grey dark:text-slate-400">
                <input type="checkbox" className="mt-0.5" checked={managedPilot} onChange={(e) => saveManagedPilot(e.target.checked)} />
                <span>Dedicated <strong>managed-aircraft</strong> pilot — excluded from SkyShare / fractional promotion tracking by default</span>
              </label>
            ) : null}
            {(/\b(captain|first officer|\bfo\b|\bpic\b|\bsic\b|pilot)\b/i.test(details.position) || details.aircraftServiceDate) ? field("Aircraft service date", "aircraftServiceDate", "date") : null}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Tags</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {EMPLOYEE_TAGS.map((t) => {
                  const on = tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      aria-pressed={on}
                      className={clsx("rounded border px-2.5 py-1 text-xs font-semibold transition", on ? clsx(tagStyle(t), "border-transparent") : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400")}
                    >
                      {t}
                    </button>
                  );
                })}
                {hire.employmentStatus === "CONTRACT" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-brand-grey dark:text-slate-500">
                    <TagPill tag="Contract" /> from status
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-500">Shown as pills on the Employees list — independent of department.</p>
            </div>
            {field("Phone", "phone")}
            {field("SkyShare email", "ssEmail")}
            {field("Personal email", "personalEmail")}
            <div className="grid grid-cols-2 gap-3">
              {field("Birth country", "birthCountry")}
              {field("Citizenship", "citizenshipCountry")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("Offer sent", "offerSentDate", "date")}
              {field("Offer signed", "offerSignedDate", "date")}
              {field("Start date", "startDate", "date")}
              {field("Orientation", "orientationDate", "date")}
              {field("Seniority date", "seniorityDate", "date")}
            </div>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Notes</span>
              <textarea
                value={details.notes}
                onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded border border-brand-lea/15 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:text-slate-100"
              />
            </label>
          </div>
        </section>

        {/* Checklist */}
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Checklist</h2>
          <div className="mt-3 space-y-5">
            {grouped.map(({ group, items }) => (
              <div key={group.key}>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{groupLabel(group.key)}</div>
                <div className="mt-2 space-y-1.5">
                  {items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded border border-brand-lea/10 px-3 py-2 dark:border-white/10">
                      <span className={clsx("text-sm", t.status === "DONE" ? "text-brand-grey line-through dark:text-slate-400" : "text-brand-black")}>{t.label}</span>
                      <div className="flex shrink-0 overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
                        {(["TODO", "DONE", "NA"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setTaskStatus(t.id, s)}
                            className={clsx(
                              "px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow",
                              t.status === s ? STATUS_BTN[s].on : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-brand-panel dark:text-slate-400"
                            )}
                          >
                            {STATUS_BTN[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {tasks.some((t) => t.group === "CUSTOM") && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">Additional milestones</div>
                <div className="mt-2 space-y-1.5">
                  {tasks
                    .filter((t) => t.group === "CUSTOM")
                    .map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 rounded border border-brand-lea/10 px-3 py-2 dark:border-white/10">
                        <span className={clsx("text-sm", t.status === "DONE" ? "text-brand-grey line-through dark:text-slate-400" : "text-brand-black")}>{t.label}</span>
                        <div className="flex shrink-0 overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
                          {(["TODO", "DONE", "NA"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setTaskStatus(t.id, s)}
                              className={clsx(
                                "px-2.5 py-1 text-xs font-semibold transition",
                                t.status === s ? STATUS_BTN[s].on : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-brand-panel dark:text-slate-400"
                              )}
                            >
                              {STATUS_BTN[s].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <BusinessCardPanel hireId={hire.id} name={hire.name} position={hire.position} phone={hire.phone} ssEmail={hire.ssEmail} status={hire.businessCardStatus} cardTitle={hire.businessCardTitle} orientationDate={hire.orientationDate} />
      </div>

      <TravelPanel subjectType="newHire" subjectId={hire.id} initialTrips={travelTrips} loyalty={travelLoyalty} />
    </div>
  );
}
