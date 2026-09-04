"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { FileText } from "lucide-react";
import type { NewHireDetail, TaskView } from "@/lib/data/onboarding";
import { TravelPanel } from "@/components/travel/TravelPanel";
import type { TravelTripView, TravelerLoyalty } from "@/lib/data/travel";
import { EmployeeJourney } from "@/components/people/EmployeeJourney";
import { HireDetailsAccordion, type DetailSection } from "@/components/people/HireDetailsAccordion";
import { OnboardingChecklist } from "@/components/people/OnboardingChecklist";
import { NewHireBottomTabs, type BottomTab } from "@/components/people/NewHireBottomTabs";
import { BusinessCardPanel } from "@/components/people/BusinessCardPanel";
import { SendOnboardingEmailButton } from "@/components/people/SendOnboardingEmailButton";
import { SendContactsEmailButton } from "@/components/people/SendContactsEmailButton";
import { SendTaskEmailButton } from "@/components/people/SendTaskEmailButton";
import type { ChecklistSection } from "@/lib/data/onboarding-grid-config";
import { SupervisorPicker } from "@/components/people/SupervisorPicker";
import { StartNewOnboardingButton } from "@/components/people/StartNewOnboardingButton";
import { OnboardingHistoryPanel } from "@/components/people/OnboardingHistoryPanel";
import { roundReasonLabel } from "@/lib/onboarding/rounds";
import type { ArchivedRoundView } from "@/lib/data/onboarding-rounds";
import type { EmployeeJourney as Journey } from "@/lib/data/employee-journey";
import type { CardOrderView } from "@/lib/data/business-cards";
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
  /** This person's own business-card orders. Empty for most new hires. */
  cardOrders: CardOrderView[];
  roleTitleOptions: string[];
  /** Checklist sections in their saved order, with their saved names. */
  sections: ChecklistSection[];
  /** Task keys she has pointed at a Front template in Manage tasks. Each one gets
   *  a Send button on its checklist row. Just the keys: the template, the
   *  recipient and the cc list are resolved server-side at send time, so a change
   *  made in Manage tasks applies to the very next send without a reload. */
  emailTaskKeys: string[];
  canEdit: boolean;
};

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function NewHireDetailWorkspace({ hire, travelTrips, travelLoyalty, journey, onboardingArchives, cardOrders, roleTitleOptions, sections, emailTaskKeys, canEdit }: Props) {
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
    birthday: toDateInput(hire.birthday),
    // Indoc is normally read off the travel booking. These two are the override,
    // and they stay EMPTY while the booking is the answer — so the box holds what
    // somebody typed and the note underneath holds what travel says. Prefilling
    // the box from travel would copy the booking into the hire on the next Save
    // and quietly stop tracking it.
    indocStartDate: toDateInput(hire.indocStartDate),
    indocEndDate: toDateInput(hire.indocEndDate),
    trainingDate: toDateInput(hire.trainingDate),
    trainingLocation: hire.trainingLocation ?? "",
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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busyCancel, setBusyCancel] = useState(false);

  const terminated = hire.employmentStatus === "TERMINATED";
  // They never started. Different from a former employee in the way that matters
  // most here: a former employee WAS one, so their history is employment history.
  // This person's offer fell through before day one, so counting them as staff —
  // in headcount, in the card queue, as a pickable supervisor — is simply wrong.
  const canceled = hire.canceled;
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

  /**
   * The offer fell through, or it did not.
   *
   * NewHire.canceled has been read by the app for a long time — the employees
   * directory, the business-card queue, the supervisor picker and the dateless-
   * hires callout all filter on it, each with a comment describing this exact
   * case — but nothing could ever SET it. So a hire whose offer died stayed
   * employmentStatus ACTIVE forever and kept showing up as staff.
   *
   * Deliberately a single boolean and nothing else. It is tempting to also clear
   * the dates or the card status here, but those are the record of what was
   * planned, and every list that matters already keys off this one flag — so
   * setting it is enough, and it stays reversible in one click.
   */
  async function setCanceled(next: boolean) {
    setBusyCancel(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/new-hires/${hire.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canceled: next })
      });
      if (!res.ok) throw new Error();
      setCancelOpen(false);
      router.refresh();
    } catch {
      setStatus(next ? "Could not mark the offer as fallen through." : "Could not bring them back.");
    } finally {
      setBusyCancel(false);
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

  function field(label: string, key: keyof typeof details, type: "text" | "date" | "number" = "text", note?: ReactNode) {
    return (
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</span>
        <input
          type={type}
          {...(type === "number" ? { min: 1, step: 1, inputMode: "numeric" as const } : {})}
          value={details[key]}
          onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
          className="mt-1 w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:shadow-glow dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
        />
        {note}
      </label>
    );
  }

  // A value read off something else. Says which of the two you are looking at,
  // and shows the other one when they disagree — the only way a stale override
  // is visible at all.
  function sourceNote(typed: string, fromTravel: string | null) {
    const base = "mt-1 block text-[10px] font-semibold uppercase tracking-[0.08em]";
    if (typed) {
      return (
        <span className={clsx(base, "text-brand-eden dark:text-brand-edenOnDark")}>
          Typed in{fromTravel ? ` · travel says ${fmtDay(fromTravel)}` : ""}
        </span>
      );
    }
    if (fromTravel) return <span className={clsx(base, "text-[#9a5b12] dark:text-brand-gold")}>From travel · {fmtDay(fromTravel)}</span>;
    return <span className={clsx(base, "text-brand-grey/70 dark:text-slate-500")}>From travel, or type it</span>;
  }

  // A read-only value that another panel on this page owns.
  function readOnlyField(label: string, value: string | null, ownedBy: string) {
    return (
      <div className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</span>
        <p className="mt-1 w-full rounded border border-dashed border-brand-lea/15 bg-white/60 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-field/60 dark:text-slate-100">
          {value && value.trim() ? value : <span className="text-brand-grey/60 dark:text-slate-500">—</span>}
        </p>
        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-grey/70 dark:text-slate-500">
          Set in {ownedBy}
        </span>
      </div>
    );
  }

  const emailKeys = useMemo(() => new Set(emailTaskKeys), [emailTaskKeys]);

  // Indoc as the TRAVEL record has it. The trip is where it is authored, so it is
  // the default answer; the hire's own indoc columns only exist to disagree with it.
  const travelIndoc = useMemo(() => {
    const trip = travelTrips.find((t) => t.indocStart) ?? null;
    return trip ? { start: trip.indocStart, end: trip.indocEnd } : null;
  }, [travelTrips]);

  const isPilotish = /\b(captain|first officer|\bfo\b|\bpic\b|\bsic\b|pilot)\b/i.test(details.position) || managedPilot;

  const legalNameControl = (
    <div className="space-y-2">
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
    </div>
  );

  const orientationExemption = (
    <label className="flex items-start gap-2 rounded border border-brand-lea/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
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
  );

  const managedPilotControl = isPilotish ? (
    <label className="flex items-start gap-2 text-xs text-brand-grey dark:text-slate-400">
      <input type="checkbox" className="mt-0.5" checked={managedPilot} onChange={(e) => saveManagedPilot(e.target.checked)} />
      <span>
        Dedicated <strong>managed-aircraft</strong> pilot — excluded from SkyShare / fractional promotion tracking by default
      </span>
    </label>
  ) : null;

  const tagsControl = (
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
              className={clsx(
                "rounded border px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow",
                on ? clsx(tagStyle(t), "border-transparent") : "border-brand-lea/20 bg-white text-brand-grey hover:text-brand-lea dark:border-white/10 dark:bg-brand-field dark:text-slate-400"
              )}
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
  );

  const notesControl = (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Notes</span>
      <textarea
        value={details.notes}
        onChange={(e) => setDetails({ ...details, notes: e.target.value })}
        rows={3}
        className="mt-1 w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:shadow-glow dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
      />
    </label>
  );

  // Who they report to. The orientation emails cc the supervisor and one is
  // addressed to them, so this is what lets the app fill that in instead of
  // leaving it as a longhand note in the template. Linking is preferred — the
  // address is then read from their record at send time rather than being a copy.
  const supervisorControl = (which: 1 | 2) => {
    const linkedIdKey = which === 1 ? "supervisorHireId" : "supervisor2HireId";
    const linkedNameKey = which === 1 ? "supervisorHireName" : "supervisor2HireName";
    const linkedEmailKey = which === 1 ? "supervisorHireEmail" : "supervisor2HireEmail";
    const nameKey = which === 1 ? ("supervisorName" as const) : ("supervisor2Name" as const);
    const emailKey = which === 1 ? ("supervisorEmail" as const) : ("supervisor2Email" as const);
    return (
      <div className="space-y-2">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
          {which === 1 ? "Supervisor" : <>Second supervisor <span className="font-normal normal-case tracking-normal text-brand-grey/70">(optional)</span></>}
        </span>
        <SupervisorPicker
          hireId={hire.id}
          linkedId={details[linkedIdKey] || null}
          linkedName={details[linkedNameKey] || null}
          linkedEmail={details[linkedEmailKey] || null}
          onLink={(p) => setDetails((f) => ({ ...f, [linkedIdKey]: p.id, [linkedNameKey]: p.name, [linkedEmailKey]: p.email ?? "" }))}
          onUnlink={() => setDetails((f) => ({ ...f, [linkedIdKey]: "", [linkedNameKey]: "", [linkedEmailKey]: "" }))}
        />
        {!details[linkedIdKey] ? (
          <>
            <p className="text-[11px] text-brand-grey dark:text-slate-500">
              Not in the app yet? Type their details instead — used only when nobody is linked.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {field("Name", nameKey)}
              {field("Email", emailKey)}
            </div>
          </>
        ) : null}
      </div>
    );
  };

  const filled = (...vals: Array<string | number | null | undefined>) => vals.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length;

  const detailSections: DetailSection[] = [
    {
      id: "identity",
      title: "Identity & contact",
      defaultOpen: true,
      filled: filled(details.name, details.position, details.department, details.location, details.phone, details.ssEmail, details.personalEmail),
      total: 7,
      rows: [
        [field("Name", "name"), field("Position", "position"), field("Department", "department"), field("Job location", "location")],
        [field("Phone", "phone"), field("SkyShare email", "ssEmail"), field("Personal email", "personalEmail")],
        [legalNameControl]
      ]
    },
    {
      id: "dates",
      title: "Dates & training",
      filled: filled(
        details.offerSentDate,
        details.offerSignedDate,
        details.startDate,
        details.orientationDate,
        details.indocStartDate || travelIndoc?.start,
        details.trainingDate,
        details.trainingLocation
      ),
      total: 7,
      rows: [
        [field("Offer sent", "offerSentDate", "date"), field("Offer signed", "offerSignedDate", "date")],
        [field("Start date", "startDate", "date"), field("Orientation", "orientationDate", "date")],
        [
          field("Indoc start", "indocStartDate", "date", sourceNote(details.indocStartDate, travelIndoc?.start ?? null)),
          field("Indoc end", "indocEndDate", "date", sourceNote(details.indocEndDate, travelIndoc?.end ?? null)),
          field("Training date", "trainingDate", "date"),
          field("Training location", "trainingLocation")
        ],
        [orientationExemption]
      ]
    },
    {
      id: "hr",
      title: "HR",
      filled: filled(
        details.birthday,
        details.seniorityDate,
        details.seniorityNumber,
        details.aircraftServiceDate,
        details.managedAircraft,
        hire.businessCardStatus,
        hire.businessCardTitle,
        details.birthCountry,
        details.citizenshipCountry,
        details.supervisorHireId || details.supervisorName,
        details.supervisor2HireId || details.supervisor2Name,
        tags.length ? "y" : "",
        details.notes
      ),
      total: 13,
      rows: [
        [
          field("Birthday", "birthday", "date"),
          field("Seniority date", "seniorityDate", "date"),
          field("Seniority # (Paycom)", "seniorityNumber", "number"),
          field("Aircraft service date", "aircraftServiceDate", "date")
        ],
        [
          field("Managed aircraft (tail #)", "managedAircraft"),
          readOnlyField("Business card", hire.businessCardStatus.toLowerCase().replace(/_/g, " "), "the Business cards panel"),
          readOnlyField("Card title", hire.businessCardTitle, "the Business cards panel")
        ],
        ...(managedPilotControl ? [[managedPilotControl]] : []),
        [field("Birth country", "birthCountry"), field("Citizenship", "citizenshipCountry")],
        [supervisorControl(1), supervisorControl(2)],
        [tagsControl],
        [notesControl]
      ]
    }
  ];

  const outstanding = tasks.filter((t) => t.status === "TODO").length;

  // Read live from tasks, not from a snapshot, so ticking travel N/A on the
  // Checklist tab changes this tab's chip without a reload.
  const travelNotNeeded = tasks.some((t) => t.key === "travel_complete" && t.status === "NA");
  const bottomTabs: BottomTab[] = [
    {
      key: "checklist",
      label: "Checklist",
      chip: outstanding ? `${outstanding} left` : "done",
      chipWarn: outstanding > 0,
      content: (
        <OnboardingChecklist
          hireId={hire.id}
          hireName={hire.name}
          tasks={tasks}
          offer={hire.offer}
          canEdit={canEdit}
          onSetStatus={setTaskStatus}
          onTaskAdded={(t) => setTasks((cur) => [...cur, t])}
          sections={sections}
          renderTaskExtra={(t) =>
            t.key === "onboarding_journey" ? (
              <SendOnboardingEmailButton
                hireId={hire.id}
                hireName={hire.name}
                taskStatus={t.status}
                canEdit={canEdit}
                onSent={() => setTasks((cur) => cur.map((x) => (x.key === "onboarding_journey" ? { ...x, status: "DONE" } : x)))}
              />
            ) : t.key === "contacts_link_sent" ? (
              <SendContactsEmailButton
                hireId={hire.id}
                hireName={hire.name}
                taskStatus={t.status}
                canEdit={canEdit}
                onSent={() => setTasks((cur) => cur.map((x) => (x.key === "contacts_link_sent" ? { ...x, status: "DONE" } : x)))}
              />
            ) : emailKeys.has(t.key) ? (
              // Any task she pointed at a Front template in Manage tasks. The two
              // above keep their own buttons because each does more than fill a
              // template — see lib/front/task-email.ts.
              <SendTaskEmailButton
                hireId={hire.id}
                taskKey={t.key}
                taskLabel={t.label}
                taskStatus={t.status}
                canEdit={canEdit}
                onSent={() => setTasks((cur) => cur.map((x) => (x.key === t.key ? { ...x, status: "DONE" } : x)))}
              />
            ) : null
          }
        />
      )
    },
    {
      key: "travel",
      label: "Travel",
      // "not needed", the same word Business cards uses, when travel has been
      // marked N/A. No new field and no migration: travel_complete is already a
      // per-hire OnboardingTask and its status is already TODO / DONE / NA, with
      // the three-state control already on the Checklist tab. Marking it N/A IS
      // the "this person does not need a trip" decision — it just was not
      // visible from this tab, so a hire with no trips looked identical whether
      // travel was not needed or simply not booked yet.
      chip:
        travelNotNeeded
          ? "not needed"
          : `${travelTrips.length} trip${travelTrips.length === 1 ? "" : "s"}`,
      content: <TravelPanel subjectType="newHire" subjectId={hire.id} initialTrips={travelTrips} loyalty={travelLoyalty} />
    },
    {
      key: "cards",
      label: "Business cards",
      chip: hire.businessCardStatus.toLowerCase().replace(/_/g, " "),
      content: (
        <BusinessCardPanel
          hireId={hire.id}
          name={hire.name}
          position={hire.position}
          phone={hire.phone}
          ssEmail={hire.ssEmail}
          status={hire.businessCardStatus}
          cardTitle={hire.businessCardTitle}
          orientationDate={hire.orientationDate}
          cardOrders={cardOrders}
        />
      )
    },
    {
      key: "history",
      label: "History",
      // "none" rather than a bare 0. The panel already renders nothing at zero,
      // so the number was telling you a count where a word reads better — and a
      // lone "0" beside "not needed" and "ordered" looked like a broken value.
      chip: onboardingArchives.length === 0 ? "none" : String(onboardingArchives.length),
      content: <OnboardingHistoryPanel hireId={hire.id} hireName={hire.name} archives={onboardingArchives} canEdit={canEdit} />
    }
  ];

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
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
          {canceled ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
              Offer fell through — never started
            </span>
          ) : null}
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
              {/* Kept apart from "former employee", which is for somebody who
                  actually worked here. Someone whose offer died before day one
                  is not a leaver, and filing them as one writes a job they never
                  had into their history.

                  canEdit-gated, unlike its neighbours in this row — they predate
                  the check and show for everyone, which is a separate thing to
                  tidy. A new control should not copy that. */}
              {!canEdit ? null : canceled ? (
                <button
                  onClick={() => void setCanceled(false)}
                  disabled={busyCancel}
                  className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
                >
                  {busyCancel ? "Saving…" : "They are coming after all"}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setStatus(null);
                    setCancelOpen(true);
                  }}
                  disabled={busyCancel}
                  className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                >
                  Offer fell through
                </button>
              )}
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

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} busy={busyCancel}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Offer fell through</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          For someone who was going to join and now is not — the offer was never sent, it was withdrawn, or they
          backed out before their first day. Not the same as “Mark as former employee,” which is for someone who
          actually worked here.
        </p>
        <p className="mt-3 text-sm font-semibold text-brand-lea dark:text-slate-100">
          {hire.name} comes off:
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-brand-grey dark:text-slate-400">
          <li>the employees directory and headcount</li>
          <li>the business-card queue</li>
          <li>the list of people who can be picked as a supervisor</li>
          <li>the “no start date” callout on the onboarding dashboard</li>
        </ul>
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
          Their record, checklist and history all stay exactly as they are, marked{" "}
          <span className="font-semibold text-brand-lea dark:text-slate-100">Canceled</span> — so if the seat reopens
          you still have everything. Reversible any time with “They are coming after all.”
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={busyCancel}>
            Cancel
          </Button>
          <Button onClick={() => void setCanceled(true)} disabled={busyCancel}>
            {busyCancel ? "Saving…" : "Yes, it fell through"}
          </Button>
        </div>
      </Modal>

      <EmployeeJourney hireId={hire.id} journey={journey} roleTitleOptions={roleTitleOptions} />

      {/* Details — the same fields as before, in three sections instead of one
          column, so the page opens on what you need rather than all of it. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {status ? <span className="mr-auto text-sm font-semibold text-brand-eden dark:text-brand-edenOnDark">{status}</span> : null}
          <button
            onClick={saveDetails}
            disabled={savingDetails}
            className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-60"
          >
            {savingDetails ? "Saving..." : "Save details"}
          </button>
        </div>
        <HireDetailsAccordion sections={detailSections} />
      </div>

      {/* The bottom half: four tabs rather than four stacked panels. Each tab
          holds the panel that already existed - none of them are restyled. */}
      <NewHireBottomTabs tabs={bottomTabs} />

      {/* TEMPORARY. The layout this page replaced on 2026-08-24, kept reachable so
          anything worth carrying over can be spotted before it is deleted. Remove
          this link, app/people/[id]/classic/ and NewHireDetailWorkspaceClassic.tsx
          together — nothing else depends on any of them. */}
      <p className="pt-2 text-center">
        <Link
          href={`/people/${hire.id}/classic`}
          className="text-xs font-semibold text-brand-grey underline-offset-2 hover:text-brand-lea hover:underline dark:text-slate-500 dark:hover:text-slate-300"
        >
          View the previous layout
        </Link>
      </p>
    </div>
  );
}
