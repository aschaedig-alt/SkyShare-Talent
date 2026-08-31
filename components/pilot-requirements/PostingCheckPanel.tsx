"use client";

import { useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui";
import type { PostingCheckFinding, PostingCheckResult } from "@/lib/requirements/posting-check";

/**
 * "Check against posting" — reads the job posting this requirement came from and
 * lists every place it disagrees with the gates as they stand.
 *
 * NOTHING HERE WRITES. Accepting a finding calls onApply, which only patches the
 * editor's form state; the existing "Save requirement" button is still what commits
 * it. The reader is wrong sometimes — on the nine live roles it read a sentence
 * describing the flight department as a Part 135 requirement — so every finding is
 * a question, and a person answers it.
 */

type PostingCheckPanelProps = {
  requirementId: string;
  /** Patch the editor's gate form state. Does not save. */
  onApply: (gateId: string, patch: { enabled: boolean; numericValue?: string; evidenceText: string }) => void;
};

function findingKey(finding: PostingCheckFinding, index: number) {
  return finding.kind === "unmappable" ? `unmappable-${index}` : `${finding.kind}-${finding.gateId}`;
}

/** The verbatim line the value was read from — the whole point of the feature. */
function Evidence({ text }: { text: string }) {
  return (
    <p className="mt-1.5 border-l-2 border-brand-lea/15 pl-2.5 font-mono text-[11px] leading-relaxed text-brand-grey dark:border-white/15 dark:text-slate-400">
      &ldquo;{text.trim()}&rdquo;
    </p>
  );
}

export function PostingCheckPanel({ requirementId, onApply }: PostingCheckPanelProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PostingCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/pilot-requirements/${requirementId}/posting-check`, { method: "POST" });
      const body = (await response.json()) as PostingCheckResult & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "The check could not be run.");
      setResult(body);
      // A re-check starts a fresh conversation; last time's decisions do not carry.
      setApplied(new Set());
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "The check could not be run.");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  function accept(finding: PostingCheckFinding, key: string) {
    if (finding.kind === "hours-differ" || finding.kind === "hours-missing") {
      onApply(finding.gateId, {
        enabled: true,
        numericValue: String(finding.postingValue),
        evidenceText: finding.evidence
      });
    } else if (finding.kind === "boolean-missing") {
      onApply(finding.gateId, { enabled: true, evidenceText: finding.evidence });
    } else {
      return;
    }
    setApplied((current) => new Set(current).add(key));
  }

  const findings = result?.findings ?? [];
  const disagreements = findings.filter((f) => f.kind !== "unmappable");
  const unmappable = findings.filter((f) => f.kind === "unmappable");

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Check against posting</p>
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">
            Read the job post and compare it to these gates
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-brand-grey dark:text-slate-400">
            Nothing is saved by this. Accepting a finding fills the gate above, and you still press &ldquo;Save
            requirement&rdquo;. The reader gets things wrong &mdash; check the quoted line before you accept it.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={run} disabled={running} className="shrink-0 disabled:opacity-60">
          <RefreshCw className={`mr-1.5 inline h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Reading the posting..." : result ? "Check again" : "Check against posting"}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded bg-brand-cloudDancer/45 px-3 py-2 text-[11px] text-brand-grey dark:bg-white/5 dark:text-slate-400">
            <span>
              Read <span className="font-semibold text-brand-lea dark:text-slate-100">{result.sourceChars.toLocaleString()}</span> characters
            </span>
            <span>
              <span className="font-semibold text-brand-lea dark:text-slate-100">{result.agreedCount}</span> gates confirmed unchanged
            </span>
            <span>
              <span className="font-semibold text-brand-lea dark:text-slate-100">{disagreements.length}</span> to look at
            </span>
            {result.readAs ? <span>read as &ldquo;{result.readAs.roleTitle}&rdquo; &middot; seat {result.readAs.seat}</span> : null}
          </div>

          {!findings.length ? (
            <p className="rounded border border-emerald-600/20 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
              The posting agrees with every gate on this requirement.
            </p>
          ) : null}

          {disagreements.map((finding, index) => {
            const key = findingKey(finding, index);
            const isApplied = applied.has(key);
            return (
              <div
                key={key}
                className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {finding.kind === "hours-differ" ? (
                      <>
                        <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">{finding.label}</p>
                        <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                          Gate says <span className="font-semibold tabular-nums text-brand-lea dark:text-slate-100">{finding.storedValue.toLocaleString()}</span>
                          {" → "}
                          posting says <span className="font-semibold tabular-nums text-brand-lea dark:text-slate-100">{finding.postingValue.toLocaleString()}</span>
                        </p>
                        <Evidence text={finding.evidence} />
                      </>
                    ) : null}

                    {finding.kind === "hours-missing" ? (
                      <>
                        <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">{finding.label}</p>
                        <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                          Not set as a gate. Posting states{" "}
                          <span className="font-semibold tabular-nums text-brand-lea dark:text-slate-100">{finding.postingValue.toLocaleString()}</span>.
                        </p>
                        <Evidence text={finding.evidence} />
                      </>
                    ) : null}

                    {finding.kind === "boolean-missing" ? (
                      <>
                        <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">{finding.label}</p>
                        <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                          Gate is off. The posting appears to require it.
                        </p>
                        <Evidence text={finding.evidence} />
                      </>
                    ) : null}

                    {finding.kind === "hours-not-in-posting" ? (
                      <>
                        <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">{finding.label}</p>
                        <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                          Gate is set to{" "}
                          <span className="font-semibold tabular-nums text-brand-lea dark:text-slate-100">{finding.storedValue.toLocaleString()}</span>, and
                          the posting does not mention it. No one-click change offered &mdash; the reader missing a line
                          looks exactly like the posting not having one. Turn it off above only if you know it is wrong.
                        </p>
                      </>
                    ) : null}
                  </div>

                  {finding.kind !== "hours-not-in-posting" ? (
                    isApplied ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <Check className="h-3 w-3" /> Filled in &mdash; not saved yet
                      </span>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => accept(finding, key)} className="shrink-0">
                        Use the posting&rsquo;s value
                      </Button>
                    )
                  ) : null}
                </div>
              </div>
            );
          })}

          {unmappable.length ? (
            <div className="rounded border-l-4 border-brand-gold bg-brand-cloudDancer/60 p-3 dark:bg-white/5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-[#8fb3d6]">
                No gate can hold these &mdash; {unmappable.length} to check by hand
              </p>
              <ul className="mt-2 space-y-3">
                {unmappable.map((finding, index) =>
                  finding.kind === "unmappable" ? (
                    <li key={`u-${index}`}>
                      <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">{finding.description}</p>
                      <Evidence text={finding.evidence} />
                      <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">{finding.whyNoGate}</p>
                    </li>
                  ) : null
                )}
              </ul>
              <p className="mt-3 text-[11px] text-brand-grey dark:text-slate-400">
                These cannot be applied. Record them in the requirement notes, or add a catalog gate that can carry them.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
