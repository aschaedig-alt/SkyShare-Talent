"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { Mail, Phone, Briefcase } from "lucide-react";
import type { CalendarData } from "@/lib/data/calendar";
import { US_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";
import { dateAtHour } from "@/lib/calendar/format";
import { interviewTypes, INTERVIEW_TYPE_META, DEFAULT_INTERVIEW_TYPE } from "@/lib/calendar/interview-types";
import { resolveDepartmentKey } from "@/lib/calendar/departments";
import { InterviewerPicker } from "@/components/calendar/InterviewerPicker";

type ScheduleInterviewFormProps = {
  candidates: CalendarData["candidates"];
  jobs: CalendarData["jobs"];
  interviewers?: CalendarData["interviewers"];
  prefilledDate?: Date | null;
};

const statusOptions = ["SCHEDULED", "COMPLETED", "CANCELLED"];

export function ScheduleInterviewForm({ candidates, jobs, interviewers = [], prefilledDate }: ScheduleInterviewFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobId, setJobId] = useState("");
  const [interviewType, setInterviewType] = useState<string>(DEFAULT_INTERVIEW_TYPE);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId]
  );

  // The selected job's department drives which interviewers are surfaced first.
  const activeDepartmentKey = useMemo(() => {
    if (!jobId) return null;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return null;
    const key = resolveDepartmentKey(job.department).deptKey;
    return key === "unassigned" ? null : key;
  }, [jobId, jobs]);

  // When candidate changes, auto-fill email/phone and suggest their applied job
  function handleCandidateChange(id: string) {
    setSelectedCandidateId(id);
    const candidate = candidates.find((c) => c.id === id);
    if (candidate) {
      setEmail(candidate.email ?? "");
      setPhone(candidate.phone ?? "");
      // Auto-select the job they applied to if there's exactly one
      if (candidate.appliedJobs.length === 1) {
        setJobId(candidate.appliedJobs[0].id);
      } else {
        setJobId("");
      }
    } else {
      setEmail("");
      setPhone("");
      setJobId("");
    }
  }

  async function scheduleInterview(formData: FormData) {
    setStatus("saving");
    setMessage("Scheduling interview...");

    const payload = {
      candidateId: selectedCandidateId,
      jobId,
      title: String(formData.get("title") ?? ""),
      interviewType,
      startDateTime: String(formData.get("startDateTime") ?? ""),
      durationMinutes: Number(formData.get("durationMinutes") ?? 60),
      timezone: String(formData.get("timezone") ?? DEFAULT_TIMEZONE),
      interviewer: String(formData.get("interviewer") ?? ""),
      location: String(formData.get("location") ?? ""),
      meetingUrl: String(formData.get("meetingUrl") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      status: String(formData.get("status") ?? "SCHEDULED"),
      email,
      phone
    };

    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "Unable to schedule interview.");
      }

      setStatus("success");
      setMessage(result.message ?? "Interview scheduled.");
      // Reset candidate-linked fields
      setSelectedCandidateId("");
      setEmail("");
      setPhone("");
      setJobId("");
      setInterviewType(DEFAULT_INTERVIEW_TYPE);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to schedule interview.");
    }
  }

  // Which jobs to show: candidate's applied jobs pinned to top
  const appliedJobIds = new Set(selectedCandidate?.appliedJobs.map((j) => j.id) ?? []);

  return (
    <section className="rounded-xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Schedule interview</p>
      <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">New interview</h2>
      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
        Pick a candidate and contact details auto-fill from their profile.
      </p>

      <form action={scheduleInterview} className="mt-4 grid gap-3">
        {/* Candidate */}
        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Candidate
          <select
            value={selectedCandidateId}
            onChange={(e) => handleCandidateChange(e.target.value)}
            required
            className="rounded-lg border border-brand-lea/20 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#10243a]"
          >
            <option value="">Choose candidate</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </select>
        </label>

        {/* Auto-filled contact info */}
        {selectedCandidate && (
          <div className="grid gap-2 rounded-lg border border-brand-sweet/30 bg-brand-sweet/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-gold">
              From profile (editable)
            </div>
            <label className="flex items-center gap-2 text-xs text-brand-lea dark:text-slate-100">
              <Mail className="h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-400" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded border border-brand-lea/20 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#10243a]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-brand-lea dark:text-slate-100">
              <Phone className="h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-400" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="w-full rounded border border-brand-lea/20 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#10243a]"
              />
            </label>
          </div>
        )}

        {/* Job / role */}
        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          <span className="flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" /> Job / role
            {selectedCandidate && appliedJobIds.size > 0 && (
              <span className="ml-1 rounded bg-brand-gold/20 px-1.5 py-0.5 text-[9px] font-bold text-brand-lea dark:text-slate-100">
                applied
              </span>
            )}
          </span>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="rounded-lg border border-brand-lea/20 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#10243a]"
          >
            <option value="">No linked job</option>
            {selectedCandidate && selectedCandidate.appliedJobs.length > 0 && (
              <optgroup label="Applied to">
                {selectedCandidate.appliedJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="All jobs">
              {jobs
                .filter((j) => !appliedJobIds.has(j.id))
                .map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>

        {/* Interview stage picker (color-coded) */}
        <div className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Interview stage
          <div className="flex flex-wrap gap-1.5">
            {interviewTypes.map((type) => {
              const meta = INTERVIEW_TYPE_META[type];
              const active = interviewType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setInterviewType(type)}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition hover:shadow-glow ${
                    active
                      ? `${meta.chip} ring-2 ring-offset-1 ring-brand-lea/30 dark:ring-white/10`
                      : "bg-brand-cloudDancer/50 text-brand-grey hover:bg-brand-cloudDancer dark:bg-white/5 dark:text-slate-400"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${active ? "bg-white/80" : meta.dot}`} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Title
            <input
              name="title"
              required
              defaultValue="Pilot interview"
              className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Status
            <select name="status" className="rounded-lg border border-brand-lea/20 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#10243a]">
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Start date/time
            <input
              name="startDateTime"
              required
              type="datetime-local"
              defaultValue={prefilledDate ? dateAtHour(prefilledDate, 9) : undefined}
              key={prefilledDate?.toISOString() ?? "no-date"}
              className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Duration
            <select name="durationMinutes" defaultValue="60" className="rounded-lg border border-brand-lea/20 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#10243a]">
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
              <option value="120">120 minutes</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Interviewer
            <InterviewerPicker interviewers={interviewers} activeDepartmentKey={activeDepartmentKey} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Timezone
            <select name="timezone" defaultValue={DEFAULT_TIMEZONE} className="rounded-lg border border-brand-lea/20 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#10243a]">
              {US_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Location
          <input name="location" placeholder="Office, room, or city" className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10" />
        </label>

        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Meeting URL
          <input name="meetingUrl" placeholder="https://..." className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10" />
        </label>

        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Notes
          <textarea name="notes" rows={3} className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10" />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-lea/90 disabled:cursor-wait disabled:opacity-70"
          >
            {status === "saving" ? "Scheduling..." : "Schedule interview"}
          </button>
          {message ? (
            <span
              role={status === "error" ? "alert" : "status"}
              aria-live={status === "error" ? undefined : "polite"}
              className={status === "error" ? "text-xs font-medium text-red-700" : "text-xs font-medium text-brand-grey dark:text-slate-400"}
            >
              {message}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
