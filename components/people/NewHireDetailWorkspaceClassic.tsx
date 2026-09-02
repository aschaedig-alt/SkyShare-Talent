"use client";

// ---------------------------------------------------------------------------
// THE PREVIOUS /people/<id> LAYOUT, kept verbatim.
//
// The page was rebuilt on 2026-08-24 (journey on top, three detail accordions,
// stage-tabbed checklist). This is the layout it replaced, preserved so Hannah
// can look at the old arrangement and say whether anything on it is worth
// bringing back before it goes for good.
//
// It is a FULL WORKING COPY, not a screenshot: it reads and writes the same
// records through the same API routes, so anything saved here is saved for
// real. It is reachable only at /people/<id>/classic and nothing links to it
// except one small link at the bottom of the live page.
//
// TEMPORARY. When the new layout is settled, delete this file, delete
// app/people/[id]/classic/, and drop the link at the bottom of
// NewHireDetailWorkspace.tsx. Nothing else depends on it.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { FileText } from "lucide-react";
import { MAINTENANCE_GROUP } from "@/lib/onboarding/tasks";
import type { ChecklistSection } from "@/lib/data/onboarding-grid-config";
import { OfferControl } from "@/components/candidates/OfferControl";
import type { NewHireDetail, TaskView } from "@/lib/data/onboarding";
import { TravelPanel } from "@/components/travel/TravelPanel";
import type { TravelTripView, TravelerLoyalty } from "@/lib/data/travel";
import { EmployeeJourney } from "@/components/people/EmployeeJourney";
import { BusinessCardPanel } from "@/components/people/BusinessCardPanel";
import { SendOnboardingEmailButton } from "@/components/people/SendOnboardingEmailButton";
import { SendContactsEmailButton } from "@/components/people/SendContactsEmailButton";
import { SendTaskEmailButton } from "@/components/people/SendTaskEmailButton";
import { SupervisorPicker } from "@/components/people/SupervisorPicker";
import { StartNewOnboardingButton } from "@/components/people/StartNewOnboardingButton";
import { OnboardingHistoryPanel } from "@/components/people/OnboardingHistoryPanel";
import { roundReasonLabel } from "@/lib/onboarding/rounds";
import type { ArchivedRoundView } from "@/lib/data/onboarding-rounds";
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
  /** Previous trips through onboarding — a rehire or a department move has one or more. */
  onboardingArchives: ArchivedRoundView[];
  roleTitleOptions: string[];
  /** Checklist sections in their saved order and with their saved names, so this
   *  parked layout cannot show a different checklist from the live one while it
   *  is being compared against it. */
  sections: ChecklistSection[];
  /** Task keys pointed at a Front template in Manage tasks. */
  emailTaskKeys: string[];
  canEdit: boolean;
};

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

const STATUS_BTN: Record<TaskView["status"], { label: string; on: string }> = {
  DONE: { label: "Done", on: "bg-emerald-500 text-white" },
  TODO: { label: "To do", on: "bg-brand-lea text-white" },
  NA: { label: "N/A", on: "bg-brand-grey text-white" }
};

export function NewHireDetailWorkspaceClassic({ hire, travelTrips, travelLoyalty, journey, onboardingArchives, roleTitleOptions, sections, emailTaskKeys, canEdit }: Props) {
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
    supervisorName: hire.supervisorName ?? "",
    supervisorEmail: hire.supervisorEmail ?? "",
    supervisorHireId: hire.supervisorHireId ?? "",
    supervisorHireName: hire.supervisorHire?.name ?? "",
    supervisorHireEmail: (hire.supervisorHire?.ssEmail || hire.supervisorHire?.personalEmail) ?? "",
    supervisor2Name: hire.supervisor2Name ?? "",
    supervisor2Email: hire.supervisor2Email ?? "",
    supervisor2HireId: hire.supervisor2HireId ?? "",
    supervisor2HireName: hire.supervisor2Hire?.name ?? "",
    supervisor2HireEmail: (hire.supervisor2Hire?.ssEmail || hire.supervisor2Hire?.personalEmail) ?? "",
    offerSentDate: toDateInput(hire.offerSentDate),
    offerSignedDate: toDateInput(hire.offerSignedDate),
    startDate: toDateInput(hire.startDate),
    orientationDate: toDateInput(hire.orientationDate),
    aircraftServiceDate: toDateInput(hire.aircraftServiceDate),
    seniorityDate: toDateInput(hire.seniorityDate),
    // Kept as a STRING in form state like every other field here; the API turns
    // an empty string back into null so a cleared box means "not recorded".
    seniorityNumber: hire.seniorityNumber === null || hire.seniorityNumber === undefined ? "" : String(hire.seniorityNumber),
    birthCountry: hire.birthCountry ?? "",
    citizenshipCountry: hire.citizenshipCountry ?? "",
    notes: hire.notes ?? ""
  });
  const [hasLegalName, setHasLegalName] = useState(Boolean(hire.legalName));
  const [managedPilot, setManagedPilot] = useState(hire.managedPilot);
  const [tags, setTags] = useState<string[]>(hire.tags ?? []);
  const [savingDetails, setSavingDetails] = useState(false);
  // Kept out of `details` on purpose: that object is all strings and feeds the
  // shared field() helper, which types its value as a string.
  const [orientationNotNeeded, setOrientationNotNeeded] = useState(hire.orientationNotNeeded);
  const [status, setStatus] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [termDate, setTermDate] = useState("");
  const [busyEmp, setBusyEmp] = useState(false);

  const terminated = hire.employmentStatus === "TERMINATED";
  // Someone with an archived round has been through onboarding before — the live
  // checklist is round N+1, and the newest archive says why it was started.
  const currentRound = onboardingArchives.length + 1;
  const currentRoundReason = onboardingArchives[0]?.reason ?? null;

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

  const emailKeys = useMemo(() => new Set(emailTaskKeys), [emailTaskKeys]);
  const grouped = useMemo(
    () => sections.map((g) => ({ group: g, items: tasks.filter((t) => t.group === g.key && t.group !== MAINTENANCE_GROUP).sort((a, b) => a.order - b.order) })),
    [tasks, sections]
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
        body: JSON.stringify({ ...details, orientationNotNeeded })
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

  function field(label: string, key: keyof typeof details, type: "text" | "date" | "number" = "text") {
    return (
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</span>
        <input
          type={type}
          {...(type === "number" ? { min: 1, step: 1, inputMode: "numeric" as const } : {})}
          value={details[key]}
          onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
          className="mt-1 w-full rounded border border-brand-lea/15 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
        />
      </label>
    );
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-gold/50 bg-brand-gold/10 px-4 py-3">
        <p className="text-sm text-brand-lea dark:text-slate-100">
          <span className="font-semibold">This is the previous layout</span>, kept for comparison. Edits here still save.
        </p>
        <Link
          href={`/people/${hire.id}`}
          className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow"
        >
          Back to the current page
        </Link>
      </div>
      <Link
        href={hire.stage === "ACTIVE" ? "/people" : "/employees"}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400"
      >
        ← {hire.stage === "ACTIVE" ? "New hires" : "Employees"}
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
          {/* The other half of the person. Documents (resume, pilot application)
              and interview history live on the CANDIDATE record, not here — the
              candidate page has always linked forward to this one, and this is
              the way back, so nobody has to go and search for their own hire. */}
          {hire.candidateId ? (
            <Link
              href={`/candidates/${hire.candidateId}`}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
            >
              <FileText className="h-3.5 w-3.5" />
              Candidate profile — documents &amp; interview history
              {hire.candidateName && hire.candidateName !== hire.name ? (
                <span className="font-normal text-brand-grey dark:text-slate-400"> (as &ldquo;{hire.candidateName}&rdquo;)</span>
              ) : null}
            </Link>
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
          {currentRound > 1 ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-brand-gold/20 px-2.5 py-0.5 text-xs font-semibold text-brand-lea dark:bg-brand-gold/20 dark:text-slate-100">
              Onboarding round {currentRound}
              {currentRoundReason ? ` · ${roundReasonLabel(currentRoundReason).toLowerCase()}` : ""}
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
          {/* Onboarding them AGAIN — a rehire, or a move big enough to redo the
              paperwork. Only offered to someone who is past onboarding already;
              for a hire still working through their first checklist, the answer
              is to edit that checklist, not to start a second one. */}
          {canEdit && hire.stage !== "ACTIVE" ? (
            <StartNewOnboardingButton
              hireId={hire.id}
              hireName={hire.name}
              position={hire.position}
              department={hire.department}
              employmentStatus={hire.employmentStatus}
              doneCount={doneCount}
              totalCount={applicable.length}
              roleTitleOptions={roleTitleOptions}
            />
          ) : null}
          {terminated ? (
            <button onClick={() => setEmployment("ACTIVE")} disabled={busyEmp} className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
              {busyEmp ? "Saving…" : "Mark as active"}
            </button>
          ) : (
            <>
              {hire.stage !== "ACTIVE" && (
                <button onClick={() => changeStage("ACTIVE")} disabled={busyStage} className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5">
                  Reactivate
                </button>
              )}
              {hire.stage === "ACTIVE" && (
                <button onClick={() => changeStage("POST_ONBOARD")} disabled={busyStage} className="rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
                  Mark onboarded
                </button>
              )}
              {hire.stage !== "ARCHIVED" && (
                <button onClick={() => changeStage("ARCHIVED")} disabled={busyStage} className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5">
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
            {/* Who they report to. The orientation emails cc the supervisor and
                one is addressed to them, so this is what lets the app fill that
                in instead of leaving it as a longhand note in the template.
                Linking is preferred — the address is then read from their record
                at send time rather than being a copy that goes stale. */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">Supervisor</span>
              <SupervisorPicker
                hireId={hire.id}
                linkedId={details.supervisorHireId || null}
                linkedName={details.supervisorHireName || null}
                linkedEmail={details.supervisorHireEmail || null}
                onLink={(p) =>
                  setDetails((f) => ({ ...f, supervisorHireId: p.id, supervisorHireName: p.name, supervisorHireEmail: p.email ?? "" }))
                }
                onUnlink={() => setDetails((f) => ({ ...f, supervisorHireId: "", supervisorHireName: "", supervisorHireEmail: "" }))}
              />
              {!details.supervisorHireId ? (
                <>
                  <p className="text-[11px] text-brand-grey dark:text-slate-500">
                    Not in the app yet? Type their details instead — these are used only when no supervisor is linked.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {field("Supervisor name", "supervisorName")}
                    {field("Supervisor email", "supervisorEmail")}
                  </div>
                </>
              ) : null}
            </div>

            {/* A second supervisor, for hires who report to two people. Both get
                the supervisors email and both are cc'd on the invitation. */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">Second supervisor <span className="normal-case text-brand-grey/70">(optional)</span></span>
              <SupervisorPicker
                hireId={hire.id}
                linkedId={details.supervisor2HireId || null}
                linkedName={details.supervisor2HireName || null}
                linkedEmail={details.supervisor2HireEmail || null}
                onLink={(p) =>
                  setDetails((f) => ({ ...f, supervisor2HireId: p.id, supervisor2HireName: p.name, supervisor2HireEmail: p.email ?? "" }))
                }
                onUnlink={() => setDetails((f) => ({ ...f, supervisor2HireId: "", supervisor2HireName: "", supervisor2HireEmail: "" }))}
              />
              {!details.supervisor2HireId ? (
                <>
                  <p className="text-[11px] text-brand-grey dark:text-slate-500">
                    Not in the app yet? Type their details instead — used only when no second supervisor is linked.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {field("Second supervisor name", "supervisor2Name")}
                    {field("Second supervisor email", "supervisor2Email")}
                  </div>
                </>
              ) : null}
            </div>
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
              {field("Seniority # (Paycom)", "seniorityNumber", "number")}
            </div>
            {/* The exemption, and the only way back from it: the orientation page
                sets this when somebody is marked Not needed, and this is where it
                gets undone. A current employee moving roles has already attended
                one, so they should not sit on the orientation list forever. */}
            <label className="flex items-start gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <input
                type="checkbox"
                checked={orientationNotNeeded}
                onChange={(e) => setOrientationNotNeeded(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-xs text-brand-grey dark:text-slate-400">
                <span className="font-semibold text-brand-lea dark:text-slate-100">No orientation needed</span>
                <br />
                Already attended a new-hire orientation — keeps them off the orientation page&apos;s outstanding list.
              </span>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Notes</span>
              <textarea
                value={details.notes}
                onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded border border-brand-lea/15 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
              />
            </label>
          </div>
        </section>

        {/* Offer — the same stepper as the candidate's Offers tab, fed by the hire's
            linked offer. Editing here syncs back to the candidate side and vice versa. */}
        {hire.offer && (
          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Offer</h2>
            <OfferControl application={hire.offer} canEdit={canEdit} />
          </section>
        )}

        {/* Checklist */}
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Checklist</h2>
          <div className="mt-3 space-y-5">
            {grouped.map(({ group, items }) => (
              <div key={group.key}>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{group.label}</div>
                <div className="mt-2 space-y-1.5">
                  {items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded border border-brand-lea/10 px-3 py-2 dark:border-white/10">
                      <span className={clsx("text-sm", t.status === "DONE" ? "text-brand-grey line-through dark:text-slate-400" : "text-brand-black dark:text-slate-100")}>{t.label}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {t.key === "onboarding_journey" && (
                          <SendOnboardingEmailButton
                            hireId={hire.id}
                            hireName={hire.name}
                            taskStatus={t.status}
                            canEdit={canEdit}
                            onSent={() => setTasks((cur) => cur.map((x) => (x.key === "onboarding_journey" ? { ...x, status: "DONE" } : x)))}
                          />
                        )}
                        {t.key === "contacts_link_sent" && (
                          <SendContactsEmailButton
                            hireId={hire.id}
                            hireName={hire.name}
                            taskStatus={t.status}
                            canEdit={canEdit}
                            onSent={() => setTasks((cur) => cur.map((x) => (x.key === "contacts_link_sent" ? { ...x, status: "DONE" } : x)))}
                          />
                        )}
                        {!["onboarding_journey", "contacts_link_sent"].includes(t.key) && emailKeys.has(t.key) && (
                          <SendTaskEmailButton
                            hireId={hire.id}
                            taskKey={t.key}
                            taskLabel={t.label}
                            taskStatus={t.status}
                            canEdit={canEdit}
                            onSent={() => setTasks((cur) => cur.map((x) => (x.key === t.key ? { ...x, status: "DONE" } : x)))}
                          />
                        )}
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
                        <span className={clsx("text-sm", t.status === "DONE" ? "text-brand-grey line-through dark:text-slate-400" : "text-brand-black dark:text-slate-100")}>{t.label}</span>
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

      <OnboardingHistoryPanel hireId={hire.id} hireName={hire.name} archives={onboardingArchives} canEdit={canEdit} />

      <TravelPanel subjectType="newHire" subjectId={hire.id} initialTrips={travelTrips} loyalty={travelLoyalty} />
    </div>
  );
}
