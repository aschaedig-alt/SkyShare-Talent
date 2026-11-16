"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import type { GuideItemView } from "@/lib/data/interview-guides";
import { Button, Modal } from "@/components/ui";
import { questionPlain } from "@/lib/interview-questions/rich";
import { plainTextToHtml } from "@/lib/richtext/normalize";
import { storedToPlain } from "@/lib/richtext/stored";

// Fill a guide's answers from a pasted transcript (Nov 16 2026). Two steps in one
// dialog: paste, then a preview of every drafted answer. NOTHING SAVES until she
// presses Save - her call: "Preview, then I choose." A question that already has
// an answer comes in unticked, so typed notes are only replaced on purpose; one
// that was never asked is listed as left blank. The drafts can be edited here
// before saving. Saving goes through the ordinary answer route, one question at a
// time, so it follows exactly the same rules as typing the answer in.

type Draft = { id: string; asked: boolean; answer: string };
type Row = Draft & { use: boolean };

const field =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100";

export function TranscriptFillModal({
  open,
  onClose,
  guideId,
  items,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  guideId: string;
  items: GuideItemView[];
  onSaved: (next: Partial<GuideItemView> & { id: string }) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const byId = new Map(items.map((it) => [it.id, it]));
  const hasAnswer = (id: string) => Boolean(storedToPlain(byId.get(id)?.answer).trim());

  function reset() {
    setTranscript("");
    setRows(null);
    setError(null);
    setSavedCount(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function draft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/interview-guides/${guideId}/from-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript })
      });
      const out = (await res.json().catch(() => ({}))) as { message?: string; drafts?: Draft[] };
      if (!res.ok || !out.drafts) throw new Error(out.message ?? "Could not read the transcript.");
      setRows(out.drafts.map((d) => ({ ...d, use: d.asked && !hasAnswer(d.id) })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the transcript.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.use && r.answer.trim());
    setBusy(true);
    setError(null);
    let done = 0;
    const failed: string[] = [];
    for (const r of chosen) {
      try {
        const res = await fetch(`/api/interview-guides/${guideId}/items/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: plainTextToHtml(r.answer.trim()) })
        });
        const out = (await res.json().catch(() => ({}))) as { message?: string; item?: Partial<GuideItemView> & { id: string } };
        if (!res.ok || !out.item) throw new Error(out.message ?? "Could not save.");
        onSaved(out.item);
        done += 1;
        setRows((cur) => (cur ? cur.map((x) => (x.id === r.id ? { ...x, use: false } : x)) : cur));
      } catch (caught) {
        const n = items.findIndex((it) => it.id === r.id) + 1;
        failed.push(`question ${n}: ${caught instanceof Error ? caught.message : "could not save"}`);
      }
    }
    setBusy(false);
    setSavedCount(done);
    if (failed.length) setError(`Not saved - ${failed.join("; ")}. The rest saved.`);
  }

  const askedRows = rows?.filter((r) => r.asked) ?? [];
  const notAsked = rows?.filter((r) => !r.asked) ?? [];
  const chosenCount = rows?.filter((r) => r.use && r.answer.trim()).length ?? 0;

  return (
    <Modal open={open} onClose={close} maxWidth="max-w-3xl" busy={busy} title="Fill answers from a transcript">
      <div className="p-5 pr-12">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold text-brand-lea dark:text-slate-100">
          <FileText className="h-5 w-5" /> Fill answers from a transcript
        </h2>

        {!rows ? (
          <>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              Paste the whole interview transcript. Each question&apos;s answer is written in the candidate&apos;s own words,
              cleaned up into full sentences. Nothing is saved until you review it on the next step.
            </p>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={12}
              placeholder="Paste the transcript here"
              aria-label="Interview transcript"
              className={`${field} mt-3 font-normal`}
            />
            <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
              {transcript.trim().length.toLocaleString("en-US")} characters
            </p>
            {error ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              <button type="button" onClick={close} className="text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
                Cancel
              </button>
              <Button onClick={draft} disabled={busy || transcript.trim().length < 200}>
                {busy ? "Reading the transcript… (up to a minute or two)" : "Draft the answers"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              Tick the answers to save. You can edit any of them first. A question that already has an answer is unticked, so
              yours is only replaced if you choose to.
            </p>

            <ol className="mt-4 space-y-3">
              {askedRows.map((r) => {
                const item = byId.get(r.id);
                const n = items.findIndex((it) => it.id === r.id) + 1;
                const existing = storedToPlain(item?.answer).trim();
                return (
                  <li key={r.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={r.use}
                        onChange={(e) => setRows((cur) => (cur ? cur.map((x) => (x.id === r.id ? { ...x, use: e.target.checked } : x)) : cur))}
                        className="mt-1 h-4 w-4 shrink-0 accent-brand-lea"
                      />
                      <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                        {n}. {questionPlain(item?.text)}
                      </span>
                    </label>
                    {existing ? (
                      <p className="mt-2 whitespace-pre-line rounded border border-dashed border-brand-lea/20 px-2.5 py-1.5 text-xs text-brand-grey dark:border-white/15 dark:text-slate-400">
                        <span className="font-semibold text-brand-lea dark:text-slate-200">Already there: </span>
                        {existing}
                      </p>
                    ) : null}
                    <textarea
                      value={r.answer}
                      onChange={(e) => setRows((cur) => (cur ? cur.map((x) => (x.id === r.id ? { ...x, answer: e.target.value } : x)) : cur))}
                      rows={Math.min(14, Math.max(4, Math.ceil(r.answer.length / 90)))}
                      aria-label={`Drafted answer for question ${n}`}
                      className={`${field} mt-2`}
                    />
                  </li>
                );
              })}
            </ol>

            {notAsked.length ? (
              <div className="mt-3 rounded border border-brand-lea/10 p-3 text-xs text-brand-grey dark:border-white/10 dark:text-slate-400">
                <span className="font-semibold text-brand-lea dark:text-slate-200">Not asked in this transcript - left blank: </span>
                {notAsked.map((r) => `${items.findIndex((it) => it.id === r.id) + 1}`).join(", ")}
              </div>
            ) : null}

            {askedRows.length === 0 ? (
              <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">None of this guide&apos;s questions were found in the transcript.</p>
            ) : null}

            {savedCount !== null ? (
              <p className="mt-3 text-sm font-medium text-brand-lea dark:text-slate-100">
                Saved {savedCount} answer{savedCount === 1 ? "" : "s"}. Press Evaluate answers on the guide to get a rating for them.
              </p>
            ) : null}
            {error ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRows((cur) => (cur ? cur.map((x) => ({ ...x, use: x.asked && Boolean(x.answer.trim()) })) : cur))}
                disabled={busy}
                className="text-sm font-semibold text-brand-grey hover:text-brand-lea disabled:opacity-50 dark:text-slate-400"
              >
                Tick all
              </button>
              <button type="button" onClick={close} disabled={busy} className="text-sm font-semibold text-brand-grey hover:text-brand-lea disabled:opacity-50 dark:text-slate-400">
                {savedCount !== null ? "Done" : "Cancel"}
              </button>
              <Button onClick={save} disabled={busy || chosenCount === 0}>
                {busy ? "Saving…" : `Save ${chosenCount} answer${chosenCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
