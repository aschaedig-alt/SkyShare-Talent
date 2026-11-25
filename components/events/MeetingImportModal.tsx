"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import { TASK_STATUSES } from "@/lib/events/constants";
import { officeDayKey } from "@/lib/dates/display";
import { readTranscriptFile, TRANSCRIPT_FILE_ACCEPT } from "@/lib/events/transcript-file";

// Upload (or paste) a planning-meeting transcript, let Claude list the action
// items, review them, save the ones you keep. Two steps on purpose: the read
// writes nothing, and nothing reaches the live database until "Save".
//
// For a company event (internal) the same read also lists ACTIVITY ideas - the
// games, swaps and contests discussed - reviewed and kept the same way (Aimee,
// Nov 25 2026: "the system can do a lot of it for us").

type Draft = {
  key: string;
  keep: boolean;
  label: string;
  owner: string;
  due: string; // yyyy-mm-dd or ""
  status: string;
  notes: string;
  evidence: string;
};

type ActivityDraft = { key: string; keep: boolean; name: string; description: string; owner: string; evidence: string };
type ProposedActivity = { name: string; description: string | null; owner: string | null; evidence: string };

type Proposed = {
  label: string;
  owner: string | null;
  dueAt: string | null;
  status: string;
  notes: string | null;
  evidence: string;
};

const SELECT =
  "rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-xs text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400";

export function MeetingImportModal({
  open,
  onClose,
  eventId,
  ownerListId,
  onSaved,
  withActivities = false
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  /** id of a <datalist> of names already on the page. */
  ownerListId: string;
  onSaved: (taskCount: number, activityCount: number) => void;
  /** A company event: also offer the activity ideas the meeting raised. */
  withActivities?: boolean;
}) {
  const [step, setStep] = useState<"source" | "review">("source");
  const [title, setTitle] = useState("Holiday party planning");
  const [heldAt, setHeldAt] = useState(officeDayKey(new Date()));
  const [fileName, setFileName] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activityDrafts, setActivityDrafts] = useState<ActivityDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("source");
    setFileName(null);
    setTranscript("");
    setSummary("");
    setTruncated(false);
    setDrafts([]);
    setActivityDrafts([]);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const text = await readTranscriptFile(file);
      if (!text.trim()) throw new Error("That file has no text in it.");
      setTranscript(text);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/meetings/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, title, heldAt })
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        summary?: string;
        truncated?: boolean;
        items?: Proposed[];
        activities?: ProposedActivity[];
      };
      if (!res.ok) throw new Error(data.message ?? "Could not read the transcript.");
      setSummary(data.summary ?? "");
      setTruncated(Boolean(data.truncated));
      setDrafts(
        (data.items ?? []).map((item, index) => ({
          key: `${index}`,
          keep: true,
          label: item.label,
          owner: item.owner ?? "",
          due: item.dueAt ? officeDayKey(item.dueAt) : "",
          status: item.status,
          notes: item.notes ?? "",
          evidence: item.evidence
        }))
      );
      setActivityDrafts(
        (withActivities ? (data.activities ?? []) : []).map((a, index) => ({
          key: `a${index}`,
          keep: true,
          name: a.name,
          description: a.description ?? "",
          owner: a.owner ?? "",
          evidence: a.evidence
        }))
      );
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the transcript.");
    } finally {
      setBusy(false);
    }
  }

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((cur) => cur.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function updateActivity(key: string, patch: Partial<ActivityDraft>) {
    setActivityDrafts((cur) => cur.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  const kept = drafts.filter((d) => d.keep && d.label.trim());
  const keptActivities = activityDrafts.filter((d) => d.keep && d.name.trim());

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          heldAt,
          fileName,
          transcript,
          items: kept.map((d) => ({
            label: d.label,
            owner: d.owner,
            dueAt: d.due,
            status: d.status,
            notes: d.notes
          })),
          activities: keptActivities.map((d) => ({ name: d.name, description: d.description, owner: d.owner }))
        })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; taskCount?: number; activityCount?: number };
      if (!res.ok) throw new Error(data.message ?? "Could not save.");
      onSaved(data.taskCount ?? kept.length, data.activityCount ?? 0);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} busy={busy} maxWidth="max-w-3xl" title="Import from a meeting">
      <div className="p-5">
        <h2 className="pr-8 text-lg font-semibold text-brand-lea dark:text-slate-100">
          {withActivities ? "Import to-dos and activities from a meeting" : "Import to-dos from a meeting"}
        </h2>

        {step === "source" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-brand-grey dark:text-slate-400">
              Upload the meeting transcript or paste it in. Claude lists who said they would do what
              {withActivities ? ", and the activity ideas that came up," : ""} and you check the list before anything is
              saved.
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className={LABEL}>Meeting</span>
                <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block">
                <span className={LABEL}>Held on</span>
                <Input className="mt-1" type="date" value={heldAt} onChange={(e) => setHeldAt(e.target.value)} />
              </label>
            </div>

            <div>
              <span className={LABEL}>Transcript</span>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded border border-dashed border-brand-lea/25 px-3 py-3 text-sm text-brand-lea transition hover:border-brand-gold hover:shadow-glow dark:border-white/15 dark:text-slate-100">
                <Upload className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">
                  {fileName ? `${fileName} (replace)` : "Choose a file: .txt, .docx, .vtt, .srt or .md"}
                </span>
                <input
                  type="file"
                  accept={TRANSCRIPT_FILE_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    void pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <Textarea
                className="mt-2 min-h-[10rem] font-mono text-xs"
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  if (!e.target.value) setFileName(null);
                }}
                placeholder="…or paste the transcript here"
              />
              {transcript ? (
                <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
                  {transcript.length.toLocaleString()} characters
                </p>
              ) : null}
            </div>

            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button onClick={read} disabled={busy || !transcript.trim()}>
                {busy ? "Reading… (up to a minute)" : withActivities ? "Read the meeting" : "Find the to-dos"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {summary ? (
              <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                {summary}
              </p>
            ) : null}
            {truncated ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                The transcript was very long, so only the first part was read. Import the rest separately.
              </p>
            ) : null}
            <p className="text-sm text-brand-grey dark:text-slate-400">
              {drafts.length === 0
                ? "No action items were found in this transcript."
                : `Found ${drafts.length}. Untick any you don't want and fix names or dates. An owner left blank was not clear from the meeting.`}
            </p>

            <ul className="space-y-3">
              {drafts.map((d) => (
                <li
                  key={d.key}
                  className={`rounded border p-3 transition ${
                    d.keep
                      ? "border-brand-lea/15 dark:border-white/10"
                      : "border-brand-lea/5 opacity-50 dark:border-white/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={d.keep}
                      onChange={(e) => update(d.key, { keep: e.target.checked })}
                      className="mt-2 h-4 w-4 shrink-0 accent-brand-gold"
                      aria-label="Keep this to-do"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input value={d.label} onChange={(e) => update(d.key, { label: e.target.value })} />
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <Input
                          list={ownerListId}
                          value={d.owner}
                          onChange={(e) => update(d.key, { owner: e.target.value })}
                          placeholder="Owner (unclear)"
                        />
                        <Input type="date" value={d.due} onChange={(e) => update(d.key, { due: e.target.value })} />
                        <select
                          className={SELECT}
                          value={d.status}
                          onChange={(e) => update(d.key, { status: e.target.value })}
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Textarea
                        rows={2}
                        className="text-xs"
                        value={d.notes}
                        onChange={(e) => update(d.key, { notes: e.target.value })}
                        placeholder="Notes"
                      />
                      {d.evidence ? (
                        <p className="text-[11px] italic text-brand-grey dark:text-slate-400">From the meeting: {d.evidence}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {withActivities ? (
              <div className="space-y-3 border-t border-brand-lea/10 pt-4 dark:border-white/10">
                <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">Activity ideas</h3>
                <p className="text-sm text-brand-grey dark:text-slate-400">
                  {activityDrafts.length === 0
                    ? "No activities came up in this meeting."
                    : `Found ${activityDrafts.length}. Kept ones are added to Activities as ideas.`}
                </p>
                <ul className="space-y-3">
                  {activityDrafts.map((d) => (
                    <li
                      key={d.key}
                      className={`rounded border p-3 transition ${
                        d.keep ? "border-brand-lea/15 dark:border-white/10" : "border-brand-lea/5 opacity-50 dark:border-white/5"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={d.keep}
                          onChange={(e) => updateActivity(d.key, { keep: e.target.checked })}
                          className="mt-2 h-4 w-4 shrink-0 accent-brand-gold"
                          aria-label="Keep this activity"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                            <Input value={d.name} onChange={(e) => updateActivity(d.key, { name: e.target.value })} />
                            <Input
                              list={ownerListId}
                              value={d.owner}
                              onChange={(e) => updateActivity(d.key, { owner: e.target.value })}
                              placeholder="Runs it (unclear)"
                            />
                          </div>
                          <Textarea
                            rows={2}
                            className="text-xs"
                            value={d.description}
                            onChange={(e) => updateActivity(d.key, { description: e.target.value })}
                            placeholder="What it is"
                          />
                          {d.evidence ? (
                            <p className="text-[11px] italic text-brand-grey dark:text-slate-400">From the meeting: {d.evidence}</p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep("source")} disabled={busy}>
                Back
              </Button>
              <Button onClick={save} disabled={busy}>
                {busy
                  ? "Saving…"
                  : kept.length || keptActivities.length
                    ? `Save ${[
                        kept.length ? `${kept.length} to-do${kept.length === 1 ? "" : "s"}` : null,
                        keptActivities.length ? `${keptActivities.length} activit${keptActivities.length === 1 ? "y" : "ies"}` : null
                      ]
                        .filter(Boolean)
                        .join(" and ")}`
                    : "Save the meeting only"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
