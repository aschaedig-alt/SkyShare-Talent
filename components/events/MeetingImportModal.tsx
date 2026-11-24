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
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  /** id of a <datalist> of names already on the page. */
  ownerListId: string;
  onSaved: (taskCount: number) => void;
}) {
  const [step, setStep] = useState<"source" | "review">("source");
  const [title, setTitle] = useState("Holiday party planning");
  const [heldAt, setHeldAt] = useState(officeDayKey(new Date()));
  const [fileName, setFileName] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("source");
    setFileName(null);
    setTranscript("");
    setSummary("");
    setTruncated(false);
    setDrafts([]);
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

  const kept = drafts.filter((d) => d.keep && d.label.trim());

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
          }))
        })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; taskCount?: number };
      if (!res.ok) throw new Error(data.message ?? "Could not save.");
      onSaved(data.taskCount ?? kept.length);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} busy={busy} maxWidth="max-w-3xl" title="Import to-dos from a meeting">
      <div className="p-5">
        <h2 className="pr-8 text-lg font-semibold text-brand-lea dark:text-slate-100">Import to-dos from a meeting</h2>

        {step === "source" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-brand-grey dark:text-slate-400">
              Upload the meeting transcript or paste it in. Claude lists who said they would do what, and you check
              the list before anything is saved.
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
                {busy ? "Reading… (up to a minute)" : "Find the to-dos"}
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

            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep("source")} disabled={busy}>
                Back
              </Button>
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving…" : kept.length ? `Save ${kept.length} to-do${kept.length === 1 ? "" : "s"}` : "Save the meeting only"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
