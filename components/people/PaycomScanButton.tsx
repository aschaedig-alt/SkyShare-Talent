"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button, Modal } from "@/components/ui";

/**
 * On-demand pull of everything the app watches for in Front — Paycom's notices
 * (background checks AND offer acceptances) plus completed pilot applications.
 *
 * ONE button rather than two, by request: the team shouldn't have to remember
 * which sweep to run, and both answer the same question ("has anything come in
 * for me?"). The two scans stay separate underneath so a failure in one still
 * lets the other report.
 *
 * The nightly crons do this on their own; the button is for "did hers come in
 * yet?" moments, and for seeing what the automation is actually doing. It runs
 * the real thing, not a dry run, because both handlers are idempotent — an
 * already-ticked step is left alone and an already-filed PDF is skipped by Front
 * message id, so clicking twice cannot do damage.
 */

type ScanRow = {
  personName: string | null;
  hireName: string | null;
  matchedBy?: "exact" | "nickname";
  /** Which Paycom notice this was — decides which group it is shown under. */
  kind?: "BG_INFO_SUBMITTED" | "BG_CHECK_COMPLETE" | "OFFER_ACCEPTED" | null;
  /** The role, on an offer acceptance. Shown so a wrong match is visible. */
  position?: string | null;
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

type PilotAppRow = {
  outcome: string;
  signerName: string | null;
  signerEmail: string | null;
  candidateName?: string;
  candidateId?: string;
  matchedBy?: "email" | "name" | "nickname" | null;
  detail?: string;
};

type OfferRow = {
  outcome: string;
  personName: string | null;
  hireName: string | null;
  matchedBy?: "exact" | "nickname";
  position?: string | null;
  detail?: string | null;
};

type OfferResponse = {
  ok?: boolean;
  message?: string;
  mailbox: string;
  messagesScanned: number;
  noticesFound: number;
  ticked: number;
  results: OfferRow[];
  /** Set when the app has no Gmail access — a sentence saying who fixes it how. */
  blocker: string | null;
};

type PilotAppResponse = {
  ok?: boolean;
  message?: string;
  conversationsScanned: number;
  noticesFound: number;
  attached: number;
  /** Names of people this run CREATED because nobody matched. */
  createdCandidates?: string[];
  results: PilotAppRow[];
  missingTags?: string[];
};

export function PaycomScanButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pilot, setPilot] = useState<PilotAppResponse | null>(null);
  const [pilotError, setPilotError] = useState<string | null>(null);
  const [offers, setOffers] = useState<OfferResponse | null>(null);
  const [offersError, setOffersError] = useState<string | null>(null);

  async function run() {
    setOpen(true);
    setRunning(true);
    setResult(null);
    setPilot(null);
    setOffers(null);
    setError(null);
    setPilotError(null);
    setOffersError(null);

    // Run all three, and let each fail on its own: if Paycom's sweep breaks, the
    // pilot-application one should still report, and vice versa. Settled rather
    // than raced so one rejection can't discard the others' results.
    const [paycomRes, pilotRes, offerRes] = await Promise.allSettled([
      fetch("/api/front/scan-paycom?apply=1", { method: "POST" }).then(async (r) => {
        const d = (await r.json().catch(() => null)) as ScanResponse | null;
        if (!r.ok || !d?.ok) throw new Error(d?.message ?? "Could not read the inbox.");
        return d;
      }),
      // createMissing matches the nightly cron. Without it this button filed
      // documents only for people who already existed, so clicking it and
      // waiting for the 7:30am run produced DIFFERENT outcomes on the same
      // thread — the button left a "could not find the candidate" note that the
      // cron would then have resolved by creating them.
      fetch("/api/front/scan-pilot-apps?apply=1&createMissing=1", { method: "POST" }).then(async (r) => {
        const d = (await r.json().catch(() => null)) as PilotAppResponse | null;
        if (!r.ok || !d?.ok) throw new Error(d?.message ?? "Could not read pilot applications.");
        return d;
      }),
      // Offer acceptances come from GMAIL, not Front — Paycom addresses that
      // notice to one person and never copies a Front inbox. A missing Gmail
      // grant comes back as ok:true with a `blocker` sentence rather than an
      // error, so it reads as "here's what to do" instead of "something broke".
      fetch("/api/gmail/scan-offer-accepted?apply=1", { method: "POST" }).then(async (r) => {
        const d = (await r.json().catch(() => null)) as OfferResponse | null;
        if (!r.ok || !d?.ok) throw new Error(d?.message ?? "Could not read the offer mailbox.");
        return d;
      })
    ]);

    if (paycomRes.status === "fulfilled") setResult(paycomRes.value);
    else setError(paycomRes.reason instanceof Error ? paycomRes.reason.message : "Could not read the inbox.");

    if (pilotRes.status === "fulfilled") setPilot(pilotRes.value);
    else setPilotError(pilotRes.reason instanceof Error ? pilotRes.reason.message : "Could not read pilot applications.");

    if (offerRes.status === "fulfilled") setOffers(offerRes.value);
    else setOffersError(offerRes.reason instanceof Error ? offerRes.reason.message : "Could not read the offer mailbox.");

    const changed =
      (paycomRes.status === "fulfilled" && paycomRes.value.ticked > 0) ||
      (pilotRes.status === "fulfilled" && pilotRes.value.attached > 0) ||
      (offerRes.status === "fulfilled" && offerRes.value.ticked > 0);
    if (changed) router.refresh();

    setRunning(false);
  }

  const ticked = result?.results.filter((r) => r.outcome === "ticked") ?? [];
  // Split by what the notice MEANT, not just that something moved. "Offer
  // accepted" and "background check started" are different news to a recruiter —
  // one is a person joining, the other is a step inside onboarding — and a single
  // "marked started for 3 people" line reads as neither.
  const tickedChecks = ticked.filter((r) => r.kind !== "OFFER_ACCEPTED");

  // Offer acceptances from EITHER door, shown as one list.
  //
  // In practice they arrive from Gmail — Paycom addresses that notice to one
  // person and never copies a Front inbox. The Front branch stays because the
  // notice CAN be routed there (by adding a Front address as a Paycom recipient),
  // and if that ever happens the reader should see one list of people, not two
  // sections split by which mailbox the app happened to read.
  const offerTicks = [
    ...ticked.filter((r) => r.kind === "OFFER_ACCEPTED"),
    ...(offers?.results.filter((r) => r.outcome === "ticked") ?? [])
  ];
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
        Check Front mail
      </Button>

      {/*
        onClose is no longer gated on `running`. A sweep in flight is a reason to
        keep the button disabled, not a reason to hold the user inside the
        dialog — the scan carries on server-side either way, and trapping
        somebody behind a spinner is how a slow request reads as a frozen app.
      */}
      <Modal open={open} onClose={() => setOpen(false)} busy={running}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Front mail</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Two sweeps in one: Paycom&apos;s notices (offer accepted, background checks), and completed pilot applications
          waiting in pilotapp@. Both run on their own each morning; clicking is just for checking now.
        </p>

        {running ? (
          <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Reading the inbox…</p>
        ) : null}

        {!running && (error || result) ? (
          <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
            Paycom notices
          </h3>
        ) : null}
        {!running && error ? (
          <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        ) : null}
        {!running && result ? (
          <div className="mt-2">
            {/* Offer acceptances lead. Somebody saying yes is the biggest thing
                in this dialog, and it is the step that moves a person from
                recruiting into onboarding. */}
            {offerTicks.length > 0 && (
              <div className="mb-3 rounded border border-brand-gold/50 bg-brand-gold/10 p-3 dark:border-brand-gold/40 dark:bg-brand-gold/10">
                <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                  {offerTicks.length === 1 ? "Offer accepted" : `${offerTicks.length} offers accepted`}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-brand-lea dark:text-slate-200">
                  {offerTicks.map((r, i) => (
                    <li key={i}>
                      {r.hireName}
                      {r.position ? (
                        <span className="text-xs text-brand-grey dark:text-slate-400"> — {r.position}</span>
                      ) : null}
                      {r.matchedBy === "nickname" ? (
                        <span className="text-xs text-brand-grey dark:text-slate-400"> (Paycom said &ldquo;{r.personName}&rdquo;)</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">
                  &ldquo;Candidate signed offer letter&rdquo; is now ticked on their checklist, and their offer shows as signed on
                  the candidate record.
                </p>
              </div>
            )}

            {tickedChecks.length > 0 ? (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Background checks moved for {tickedChecks.length} {tickedChecks.length === 1 ? "person" : "people"}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-emerald-900 dark:text-emerald-200">
                  {tickedChecks.map((r, i) => (
                    <li key={i}>
                      {r.hireName}
                      {r.matchedBy === "nickname" ? (
                        <span className="text-xs text-emerald-700 dark:text-emerald-400"> — Paycom said &ldquo;{r.personName}&rdquo;</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : offerTicks.length > 0 ? null : (
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

        {/*
          Offer acceptances are read from Gmail, so they have a failure mode the
          Front sweeps do not: the app may simply not have been granted access
          yet. That is not an error and must not read as one — it is one person
          doing one thing, so the blocker sentence says who and what.
        */}
        {!running && offersError ? (
          <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{offersError}</p>
        ) : null}
        {!running && offers?.blocker ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Offer acceptances aren&apos;t being checked</p>
            <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">{offers.blocker}</p>
            <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
              Paycom sends &ldquo;Offer Accepted&rdquo; to {offers.mailbox} only — it never reaches a shared inbox, so the app
              reads it there. Everything else on this dialog is unaffected.
            </p>
          </div>
        ) : null}

        {/* --- pilot applications --- */}
        {!running && (pilotError || pilot) ? (
          <h3 className="mt-5 border-t border-brand-lea/10 pt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
            Pilot applications
          </h3>
        ) : null}
        {!running && pilotError ? (
          <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{pilotError}</p>
        ) : null}
        {!running && pilot ? <PilotAppResults pilot={pilot} /> : null}

        <div className="mt-5 flex justify-end">
          {/*
            Done stays enabled while the sweep runs, so it agrees with Escape and
            the dialog's close button rather than being the one greyed way out.
            Leaving early is safe: the sweep is server-side and idempotent (it
            only ticks forward and skips what it has already handled), which is
            the same property that lets the nightly cron re-run it.
          */}
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
      </Modal>
    </>
  );
}

/**
 * What the pilot-application sweep did.
 *
 * The unfiled ones matter more than the filed ones here: a filed application is
 * self-evident on the candidate, but one we could NOT place is sitting in Front
 * waiting for a person, and that has to be visible rather than buried in a tally.
 */
function PilotAppResults({ pilot }: { pilot: PilotAppResponse }) {
  const filed = pilot.results.filter((r) => r.outcome === "attached" && r.candidateId);
  const unplaced = pilot.results.filter((r) => r.outcome === "no-match" || r.outcome === "ambiguous-match");
  const unreadable = pilot.results.filter((r) => r.outcome === "no-identifier" || r.outcome === "no-attachment");

  const created = pilot.createdCandidates ?? [];

  return (
    <div className="mt-2">
      {/* People this run ADDED, called out ahead of everything else. They also
          appear under Filed below, but a run that created a person did more than
          file a document and the modal has to say so — this is the only moment
          anyone sees it, and a new record in a shared database should never be
          something you have to infer from a tally. */}
      {created.length > 0 && (
        <div className="mb-3 rounded border border-brand-gold/50 bg-brand-gold/10 p-3 dark:border-brand-gold/40 dark:bg-brand-gold/10">
          <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
            Added {created.length} new {created.length === 1 ? "candidate" : "candidates"}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-brand-lea dark:text-slate-200">
            {created.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">
            Nobody matched these applications, so each person was created from the application itself — it holds only
            the name and email that were on it. Their Front threads are tagged Candidate Created by App.
          </p>
        </div>
      )}

      {filed.length > 0 ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Filed {filed.length} pilot {filed.length === 1 ? "application" : "applications"}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-emerald-900 dark:text-emerald-200">
            {filed.map((r, i) => (
              <li key={i}>
                {r.candidateName}
                {r.matchedBy && r.matchedBy !== "name" ? (
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">
                    {" "}
                    — matched by {r.matchedBy === "email" ? "email" : "name variant"}
                    {r.signerName && r.signerName !== r.candidateName ? ` (signed as “${r.signerName}”)` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Each PDF is on the candidate&apos;s Documents tab. The Front threads are left OPEN on purpose — the
            application still needs adding to Paycom by hand. Archive the thread in Front once that&apos;s done.
          </p>
        </div>
      ) : (
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
          <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">Nothing new to file</p>
          <p className="mt-0.5 text-sm text-brand-grey dark:text-slate-400">
            {pilot.noticesFound === 0
              ? "No unhandled pilot applications are waiting."
              : `${pilot.noticesFound} ${pilot.noticesFound === 1 ? "notice" : "notices"} found, none newly filed.`}
          </p>
        </div>
      )}

      {unplaced.length > 0 && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {unplaced.length} {unplaced.length === 1 ? "application needs" : "applications need"} a person
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
            Nothing was downloaded for these and their threads are still open in Front, with a note saying why. Add the
            candidate and run this again, or file the PDF by hand.
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-900 dark:text-amber-200">
            {unplaced.map((r, i) => (
              <li key={i}>
                {r.signerName ?? r.signerEmail}
                {r.outcome === "ambiguous-match" ? (
                  <span className="text-xs"> — matches more than one candidate</span>
                ) : (
                  <span className="text-xs"> — no matching candidate</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unreadable.length > 0 && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {unreadable.length} {unreadable.length === 1 ? "notice" : "notices"} couldn&apos;t be read
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
            Either no PDF was attached or the signer couldn&apos;t be identified. Adobe may have changed the wording — worth
            passing on to whoever looks after the app.
          </p>
        </div>
      )}

      {pilot.missingTags && pilot.missingTags.length > 0 && (
        <div className="mt-3 rounded border border-brand-lea/10 p-3 dark:border-white/10">
          <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">Tag not in Front yet</p>
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
            Create a tag with this exact name in Front and it starts being used — nothing else to set up.
          </p>
          <p className="mt-1 font-mono text-sm text-brand-lea dark:text-slate-100">{pilot.missingTags.join(", ")}</p>
        </div>
      )}

      <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">
        Checked {pilot.conversationsScanned} open {pilot.conversationsScanned === 1 ? "thread" : "threads"} in pilotapp@.
      </p>
    </div>
  );
}
