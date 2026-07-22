"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button, Modal } from "@/components/ui";

/**
 * On-demand pull of Paycom's background-check notices out of Front.
 *
 * The nightly cron does this on its own; this button is for "did hers come in
 * yet?" moments, and for seeing what the automation is actually doing. It runs
 * the real thing (not a dry run) because the underlying handler only ticks
 * forward and is idempotent — clicking twice cannot do damage.
 */

type ScanRow = {
  personName: string | null;
  hireName: string | null;
  matchedBy?: "exact" | "nickname";
  /** Task key on a tick; on a failure, why it could not be read. */
  detail?: string | null;
  outcome: string;
};

type ScanResponse = {
  ok?: boolean;
  message?: string;
  conversationsScanned: number;
  noticesFound: number;
  ticked: number;
  results: ScanRow[];
  /** Tag names it wanted to apply in Front but couldn't find. */
  missingTags?: string[];
};

export function PaycomScanButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setOpen(true);
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/front/scan-paycom?apply=1", { method: "POST" });
      const data = (await res.json().catch(() => null)) as ScanResponse | null;
      if (!res.ok || !data?.ok) throw new Error(data?.message ?? "Could not read the inbox.");
      setResult(data);
      if (data.ticked > 0) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the inbox.");
    } finally {
      setRunning(false);
    }
  }

  const ticked = result?.results.filter((r) => r.outcome === "ticked") ?? [];
  // People Paycom named that we deliberately left alone — usually former staff or
  // someone who never made it onto the roster. Shown so it isn't silent.
  const unmatched = result ? [...new Set(result.results.filter((r) => r.outcome === "no-match").map((r) => r.personName))] : [];

  // Paycom mail we could NOT act on. This has to be visible: the handler only
  // knows the exact subjects and wordings we have seen, so if Paycom changes
  // either, every affected notice would otherwise be dropped in silence — which
  // is precisely how the first version missed 33 of them. Surfacing it turns a
  // silent miss into something someone can report.
  const unreadable = result
    ? result.results.filter((r) => r.outcome === "unrecognised-subject" || r.outcome === "no-name-found")
    : [];

  return (
    <>
      <Button variant="secondary" onClick={run}>
        <MailCheck className="h-4 w-4" />
        Check Paycom mail
      </Button>

      <Modal open={open} onClose={() => !running && setOpen(false)} busy={running}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Paycom background checks</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Reads Paycom&apos;s automated notices in Front and ticks the background-check steps they report — the candidate
          submitting their information, and the check coming back clear. Starting the check in Paycom stays a manual tick.
          This runs on its own each morning; clicking is just for checking now.
        </p>

        {running ? (
          <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Reading the inbox…</p>
        ) : error ? (
          <p className="mt-4 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        ) : result ? (
          <div className="mt-4">
            {ticked.length > 0 ? (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Marked started for {ticked.length} {ticked.length === 1 ? "person" : "people"}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-emerald-900 dark:text-emerald-200">
                  {ticked.map((r, i) => (
                    <li key={i}>
                      {r.hireName}
                      {r.matchedBy === "nickname" ? (
                        <span className="text-xs text-emerald-700 dark:text-emerald-400"> — Paycom said &ldquo;{r.personName}&rdquo;</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">Nothing new</p>
                <p className="mt-0.5 text-sm text-brand-grey dark:text-slate-400">
                  {result.noticesFound} {result.noticesFound === 1 ? "notice" : "notices"} found, all already recorded.
                </p>
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="mt-3 rounded border border-brand-lea/10 p-3 dark:border-white/10">
                <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">Left alone</p>
                <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                  Paycom named these people, but they aren&apos;t a current new hire here — usually former staff, or someone who
                  never made it onto the roster. Nothing was changed for them.
                </p>
                <p className="mt-1 text-sm text-brand-lea dark:text-slate-100">{unmatched.join(", ")}</p>
              </div>
            )}

            {unreadable.length > 0 && (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {unreadable.length} Paycom {unreadable.length === 1 ? "email" : "emails"} couldn&apos;t be read
                </p>
                <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
                  Paycom has probably changed the wording. Nothing was ticked for these — send this to whoever looks after
                  the app and it&apos;s a small fix.
                </p>
                {[...new Set(unreadable.map((r) => (r.detail ?? "").slice(0, 90)))].slice(0, 3).map((d, i) => (
                  <p key={i} className="mt-1 break-words font-mono text-[11px] text-amber-900 dark:text-amber-200">
                    {d}
                  </p>
                ))}
              </div>
            )}

            {result.missingTags && result.missingTags.length > 0 && (
              <div className="mt-3 rounded border border-brand-lea/10 p-3 dark:border-white/10">
                <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">Tag not in Front yet</p>
                <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                  Threads get tagged so you can search for them in Front. Create a tag with this exact name and it starts
                  being used — nothing else to set up.
                </p>
                <p className="mt-1 font-mono text-sm text-brand-lea dark:text-slate-100">{result.missingTags.join(", ")}</p>
              </div>
            )}

            <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">
              Checked the {result.conversationsScanned} most recent Paycom threads.
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button onClick={() => setOpen(false)} disabled={running}>
            Done
          </Button>
        </div>
      </Modal>
    </>
  );
}
