"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { ONBOARDING_GROUPS, groupLabel } from "@/lib/onboarding/tasks";
import type { NewHireDetail, TaskView } from "@/lib/data/onboarding";

type Props = { hire: NewHireDetail };

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

const STATUS_BTN: Record<TaskView["status"], { label: string; on: string }> = {
  DONE: { label: "Done", on: "bg-emerald-500 text-white" },
  TODO: { label: "To do", on: "bg-brand-lea text-white" },
  NA: { label: "N/A", on: "bg-brand-grey text-white" }
};

export function NewHireDetailWorkspace({ hire }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskView[]>(hire.tasks);
  const [details, setDetails] = useState({
    name: hire.name,
    position: hire.position ?? "",
    department: hire.department ?? "",
    phone: hire.phone ?? "",
    ssEmail: hire.ssEmail ?? "",
    personalEmail: hire.personalEmail ?? "",
    offerSentDate: toDateInput(hire.offerSentDate),
    offerSignedDate: toDateInput(hire.offerSignedDate),
    startDate: toDateInput(hire.startDate),
    orientationDate: toDateInput(hire.orientationDate),
    notes: hire.notes ?? ""
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState(false);

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
      <Link href="/people" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400 dark:text-slate-100">
        ← Pre-onboarding
      </Link>

      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{hire.name}</h1>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            {hire.position ?? "Position not set"}
            {hire.department ? ` · ${hire.department}` : ""}
          </p>
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
        </div>
      </section>

      {status ? <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{status}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {/* Details */}
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Details</h2>
            <button onClick={saveDetails} disabled={savingDetails} className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
              {savingDetails ? "Saving..." : "Save"}
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {field("Name", "name")}
            {field("Position", "position")}
            {field("Department", "department")}
            {field("Phone", "phone")}
            {field("SkyShare email", "ssEmail")}
            {field("Personal email", "personalEmail")}
            <div className="grid grid-cols-2 gap-3">
              {field("Offer sent", "offerSentDate", "date")}
              {field("Offer signed", "offerSignedDate", "date")}
              {field("Start date", "startDate", "date")}
              {field("Orientation", "orientationDate", "date")}
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
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Checklist</h2>
          <div className="mt-3 space-y-5">
            {grouped.map(({ group, items }) => (
              <div key={group.key}>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{groupLabel(group.key)}</div>
                <div className="mt-2 space-y-1.5">
                  {items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded border border-brand-lea/10 px-3 py-2 dark:border-white/10">
                      <span className={clsx("text-sm", t.status === "DONE" ? "text-brand-grey line-through dark:text-slate-400" : "text-brand-black dark:text-slate-100")}>{t.label}</span>
                      <div className="flex shrink-0 overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
                        {(["TODO", "DONE", "NA"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setTaskStatus(t.id, s)}
                            className={clsx(
                              "px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow",
                              t.status === s ? STATUS_BTN[s].on : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-[#10243a] dark:text-slate-400 dark:bg-white/5"
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
                        <span className={clsx("text-sm", t.status === "DONE" ? "text-brand-grey line-through dark:text-slate-400" : "text-brand-black dark:text-slate-100")}>{t.label}</span>
                        <div className="flex shrink-0 overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
                          {(["TODO", "DONE", "NA"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setTaskStatus(t.id, s)}
                              className={clsx(
                                "px-2.5 py-1 text-xs font-semibold transition",
                                t.status === s ? STATUS_BTN[s].on : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-[#10243a] dark:text-slate-400 dark:bg-white/5"
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
      </div>
    </div>
  );
}
