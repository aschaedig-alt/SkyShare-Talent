"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CalendarData } from "@/lib/data/calendar";

type ScheduleInterviewFormProps = {
  candidates: CalendarData["candidates"];
  jobs: CalendarData["jobs"];
  prefilledDate?: Date | null;
};

const statusOptions = ["SCHEDULED", "COMPLETED", "CANCELLED"];

// Convert a Date to datetime-local input value (local time, defaults to 9am)
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00`;
}

export function ScheduleInterviewForm({ candidates, jobs, prefilledDate }: ScheduleInterviewFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function scheduleInterview(formData: FormData) {
    setStatus("saving");
    setMessage("Scheduling interview...");

    const payload = {
      candidateId: String(formData.get("candidateId") ?? ""),
      jobId: String(formData.get("jobId") ?? ""),
      title: String(formData.get("title") ?? ""),
      startDateTime: String(formData.get("startDateTime") ?? ""),
      durationMinutes: Number(formData.get("durationMinutes") ?? 60),
      timezone: String(formData.get("timezone") ?? "America/Denver"),
      interviewer: String(formData.get("interviewer") ?? ""),
      location: String(formData.get("location") ?? ""),
      meetingUrl: String(formData.get("meetingUrl") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      status: String(formData.get("status") ?? "SCHEDULED")
    };

    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "Unable to schedule interview.");
      }

      setStatus("success");
      setMessage(result.message ?? "Interview scheduled.");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to schedule interview.");
    }
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Schedule interview</p>
      <h2 className="text-base font-semibold text-brand-lea">Create local calendar event</h2>
      <p className="mt-1 text-xs text-brand-grey">
        This creates a local interview record. Google sync will come later after OAuth and deployment are decided.
      </p>

      <form action={scheduleInterview} className="mt-4 grid gap-3">
        <label className="grid gap-1 text-xs font-semibold text-brand-lea">
          Candidate
          <select name="candidateId" required className="rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm">
            <option value="">Choose candidate</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-xs font-semibold text-brand-lea">
          Job / role
          <select name="jobId" className="rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm">
            <option value="">No linked job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-brand-lea">
            Title
            <input
              name="title"
              required
              defaultValue="Pilot interview"
              className="rounded border border-brand-lea/20 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-brand-lea">
            Status
            <select name="status" className="rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm">
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-brand-lea">
            Start date/time
            <input
              name="startDateTime"
              required
              type="datetime-local"
              defaultValue={prefilledDate ? toDateTimeLocal(prefilledDate) : undefined}
              key={prefilledDate?.toISOString() ?? "no-date"}
              className="rounded border border-brand-lea/20 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-brand-lea">
            Duration
            <select name="durationMinutes" defaultValue="60" className="rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm">
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
              <option value="120">120 minutes</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-brand-lea">
            Interviewer
            <input name="interviewer" className="rounded border border-brand-lea/20 px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-brand-lea">
            Timezone
            <input name="timezone" defaultValue="America/Denver" className="rounded border border-brand-lea/20 px-3 py-2 text-sm" />
          </label>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-brand-lea">
          Location / meeting link
          <input name="location" className="rounded border border-brand-lea/20 px-3 py-2 text-sm" />
        </label>

        <label className="grid gap-1 text-xs font-semibold text-brand-lea">
          Meeting URL
          <input name="meetingUrl" className="rounded border border-brand-lea/20 px-3 py-2 text-sm" />
        </label>

        <label className="grid gap-1 text-xs font-semibold text-brand-lea">
          Notes
          <textarea name="notes" rows={3} className="rounded border border-brand-lea/20 px-3 py-2 text-sm" />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-lea/90 disabled:cursor-wait disabled:opacity-70"
          >
            {status === "saving" ? "Scheduling..." : "Schedule interview"}
          </button>
          {message ? (
            <span
              role={status === "error" ? "alert" : "status"}
              aria-live={status === "error" ? undefined : "polite"}
              className={status === "error" ? "text-xs font-medium text-red-700" : "text-xs font-medium text-brand-grey"}
            >
              {message}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
