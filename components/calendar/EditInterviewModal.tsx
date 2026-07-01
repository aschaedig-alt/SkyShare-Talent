"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader, Trash2, ClipboardCheck } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";
import type { CalendarData } from "@/lib/data/calendar";
import { interviewTypes, INTERVIEW_TYPE_META, DEFAULT_INTERVIEW_TYPE } from "@/lib/calendar/interview-types";
import { resolveDepartmentKey } from "@/lib/calendar/departments";
import { InterviewerPicker } from "@/components/calendar/InterviewerPicker";

type Interview = CalendarData["interviews"][number];

interface EditInterviewModalProps {
  interview: Interview;
  jobs: CalendarData["jobs"];
  interviewers?: CalendarData["interviewers"];
  onClose: () => void;
  onSaved: () => void;
}

const statusOptions = ["SCHEDULED", "COMPLETED", "CANCELLED"];

// Convert ISO to datetime-local input value (local time)
function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditInterviewModal({ interview, jobs, interviewers = [], onClose, onSaved }: EditInterviewModalProps) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [interviewType, setInterviewType] = useState<string>(interview.interviewType || DEFAULT_INTERVIEW_TYPE);
  const [selectedJobId, setSelectedJobId] = useState<string>(interview.job?.id ?? "");

  // The linked job's department surfaces matching interviewers first in the picker.
  const activeDepartmentKey = useMemo(() => {
    if (!selectedJobId) return null;
    const job = jobs.find((j) => j.id === selectedJobId);
    if (!job) return null;
    const key = resolveDepartmentKey(job.department).deptKey;
    return key === "unassigned" ? null : key;
  }, [selectedJobId, jobs]);

  // Derive the interview's actual duration so editing doesn't silently reset it to 60.
  const initialDuration = (() => {
    if (!interview.endDateTime) return "60";
    const mins = Math.round(
      (new Date(interview.endDateTime).getTime() - new Date(interview.startDateTime).getTime()) / 60000
    );
    return ["30", "45", "60", "90", "120"].includes(String(mins)) ? String(mins) : "60";
  })();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      jobId: String(formData.get("jobId") ?? ""),
      title: String(formData.get("title") ?? ""),
      interviewType,
      startDateTime: String(formData.get("startDateTime") ?? ""),
      durationMinutes: Number(formData.get("durationMinutes") ?? 60),
      interviewer: String(formData.get("interviewer") ?? ""),
      location: String(formData.get("location") ?? ""),
      meetingUrl: String(formData.get("meetingUrl") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      status: String(formData.get("status") ?? "SCHEDULED")
    };

    try {
      const response = await fetch(`/api/interviews/${interview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message ?? "Unable to update interview.");
      }

      setMessage({ type: "success", text: "Interview updated." });
      setTimeout(() => {
        onSaved();
        onClose();
      }, 800);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to update." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/interviews/${interview.id}`, { method: "DELETE" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message ?? "Unable to delete interview.");
      }

      setMessage({ type: "success", text: "Interview deleted." });
      setTimeout(() => {
        onSaved();
        onClose();
      }, 800);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to delete." });
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded bg-white shadow-xl max-h-[90vh] overflow-y-auto dark:bg-brand-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 border-b border-brand-lea/10 bg-white px-6 py-4 dark:border-white/10 dark:bg-brand-panel">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">Edit Interview</h2>
              <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">{interview.candidate.displayName}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href={`/interviews/${interview.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <ClipboardCheck className="h-4 w-4" /> Scorecards
              </Link>
              <button onClick={onClose} className="text-brand-grey hover:text-brand-lea dark:text-slate-400">
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
              Title
              <input
                name="title"
                required
                defaultValue={interview.title}
                className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
              Status
              <select
                name="status"
                defaultValue={interview.status}
                className="rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-brand-panel"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Interview stage picker */}
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

          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Job / role
            <select
              name="jobId"
              defaultValue={interview.job?.id ?? ""}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-brand-panel"
            >
              <option value="">No linked job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
              Start date/time
              <input
                name="startDateTime"
                required
                type="datetime-local"
                defaultValue={toDateTimeLocal(interview.startDateTime)}
                className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
              Duration
              <select
                name="durationMinutes"
                defaultValue={initialDuration}
                className="rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-brand-panel"
              >
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Interviewer
            <InterviewerPicker
              defaultValue={interview.interviewer ?? ""}
              interviewers={interviewers}
              activeDepartmentKey={activeDepartmentKey}
              className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Location
            <input
              name="location"
              defaultValue={interview.location ?? ""}
              className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Meeting URL
            <input
              name="meetingUrl"
              defaultValue={interview.meetingUrl ?? ""}
              className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
            Notes
            <textarea
              name="notes"
              rows={3}
              defaultValue={interview.notes ?? ""}
              className="rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
            />
          </label>

          {/* Inline feedback — kept next to the buttons so it's always visible */}
          {message && (
            <div
              className={`rounded p-3 text-sm ${
                message.type === "success"
                  ? "border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1 rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? <Loader className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Confirm delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea dark:border-white/10 dark:text-slate-100"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea hover:bg-brand-cloudDancer/20 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
              >
                Cancel
              </button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
