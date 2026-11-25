"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal } from "@/components/ui";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import { formatCents } from "@/lib/party-store/shared";

// Email each chosen employee their leftover credit and personal pre-order link.
//
// NOTHING SENDS UNTIL THE BUTTON IS PRESSED AND CONFIRMED. Opening the dialog only
// reads. The guard banner says plainly where the mail will actually go in this
// environment (outside production: the test inbox, or nowhere).

type Recipient = {
  newHireId: string;
  name: string;
  email: string | null;
  balanceCents: number;
  lastEmailedAt: string | null;
  lastEmailMode: string | null;
  blocked: string | null;
};

type Plan = {
  subject: string;
  bodyHtml: string;
  guardMode: "production" | "internal" | "redirected" | "blocked";
  testInbox: string | null;
  recipients: Recipient[];
  batchMax: number;
  preview: { name: string; greetingHtml: string; creditHtml: string } | null;
};

type Result = { newHireId: string; name: string; ok: boolean; mode?: string; error?: string };

const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", month: "short", day: "numeric" });

export function CreditEmailDialog({
  storeId,
  open,
  onClose,
  onSent
}: {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [includeEmailed, setIncludeEmailed] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPlan(null);
    setLoadError(null);
    setResults(null);
    setProgress(null);
    setEdited(null);
    void fetch(`/api/events/store/${storeId}/email`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Plan & { message?: string };
        if (!live) return;
        if (!res.ok) {
          setLoadError(data.message ?? "Could not load the send list.");
          return;
        }
        setPlan(data);
        setSubject(data.subject);
      })
      .catch(() => live && setLoadError("Could not load the send list."));
    return () => {
      live = false;
    };
  }, [open, storeId]);

  const eligible = useMemo(
    () => (plan?.recipients ?? []).filter((r) => !r.blocked && (includeEmailed || !r.lastEmailedAt)),
    [plan, includeEmailed]
  );
  const blockedCount = (plan?.recipients ?? []).filter((r) => r.blocked && r.blocked !== "No credit left").length;

  // Nobody is ticked to start with: he decides who gets it ("dont plan to send
  // anything until i choose", Nov 24 2026). "All" is one click away. Changing the
  // list (the already-emailed box) drops anyone no longer in it.
  useEffect(() => {
    const ids = new Set(eligible.map((r) => r.newHireId));
    setPicked((cur) => new Set([...cur].filter((id) => ids.has(id))));
  }, [eligible]);

  const chosen = eligible.filter((r) => picked.has(r.newHireId));
  const canSend = plan && plan.guardMode !== "blocked" && chosen.length > 0 && !sending && subject.trim();

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!plan || !canSend) return;
    const where =
      plan.guardMode === "production"
        ? `${chosen.length} real employee${chosen.length === 1 ? "" : "s"}`
        : `the test inbox (${plan.testInbox}) — ${chosen.length} email${chosen.length === 1 ? "" : "s"}, as this is not production`;
    if (!window.confirm(`Send the store credit email to ${where}? Sent email can't be taken back.`)) return;

    setSending(true);
    const all: Result[] = [];
    const ids = chosen.map((r) => r.newHireId);
    for (let i = 0; i < ids.length; i += plan.batchMax) {
      const batch = ids.slice(i, i + plan.batchMax);
      setProgress(`Sending ${Math.min(i + batch.length, ids.length)} of ${ids.length}…`);
      const res = await fetch(`/api/events/store/${storeId}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, newHireIds: batch, subject, bodyHtml: edited })
      });
      const data = (await res.json().catch(() => ({}))) as { results?: Result[]; message?: string };
      if (!res.ok) {
        all.push(...batch.map((id) => ({ newHireId: id, name: chosen.find((c) => c.newHireId === id)?.name ?? "?", ok: false, error: data.message ?? "Send failed." })));
        break; // stop on a whole-batch failure rather than hammering on
      }
      all.push(...(data.results ?? []));
    }
    setSending(false);
    setProgress(null);
    setResults(all);
    onSent();
  }

  const okCount = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <Modal open={open} onClose={onClose} busy={sending} maxWidth="max-w-3xl" title="Email store credit links">
      <div className="p-5">
        <h2 className="pr-8 text-lg font-semibold text-brand-lea dark:text-slate-100">Email store credit links</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Each person gets their own email with their credit left and their personal link. Nothing sends until you press
          Send and confirm.
        </p>

        {loadError ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{loadError}</p> : null}
        {!plan && !loadError ? <p className="mt-4 text-sm text-brand-grey">Loading…</p> : null}

        {plan && results ? (
          <div className="mt-4 space-y-3">
            <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              {okCount} sent{plan.guardMode === "redirected" ? ` — to the test inbox (${plan.testInbox}), not to employees` : ""}.
              {failed.length ? ` ${failed.length} did not send.` : ""}
            </p>
            {failed.length ? (
              <ul className="space-y-1 text-sm text-red-600 dark:text-red-400">
                {failed.map((f) => (
                  <li key={f.newHireId}>
                    {f.name}: {f.error}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : null}

        {plan && !results ? (
          <div className="mt-4 space-y-4">
            {plan.guardMode === "production" ? (
              <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                These go to real employees&apos; SkyShare inboxes, from hrotasks@.
              </p>
            ) : plan.guardMode === "redirected" ? (
              <p className="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
                This is not the live site, so every email would go to the test inbox ({plan.testInbox}) instead of the employee.
              </p>
            ) : (
              <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300">
                This is not the live site and no test inbox is set, so sending is turned off here.
              </p>
            )}

            {/* Who */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
                  Send to · {chosen.length} of {eligible.length} picked
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 text-brand-grey dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={includeEmailed}
                      onChange={(e) => setIncludeEmailed(e.target.checked)}
                      className="h-3.5 w-3.5 accent-brand-gold"
                    />
                    Include people already emailed
                  </label>
                  <button className="font-semibold text-brand-eden hover:underline dark:text-brand-sweet" onClick={() => setPicked(new Set(eligible.map((r) => r.newHireId)))}>
                    All
                  </button>
                  <button className="font-semibold text-brand-eden hover:underline dark:text-brand-sweet" onClick={() => setPicked(new Set())}>
                    None
                  </button>
                </div>
              </div>
              {eligible.length === 0 ? (
                <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
                  Nobody to email: everyone with credit left has already been emailed (tick &ldquo;Include people already
                  emailed&rdquo; to send again).
                </p>
              ) : (
                <ul className="mt-2 grid gap-1 rounded border border-brand-lea/10 p-2 sm:grid-cols-2 dark:border-white/10">
                  {eligible.map((r) => (
                    <li key={r.newHireId}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-brand-cloudDancer/60 dark:hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={picked.has(r.newHireId)}
                          onChange={() => toggle(r.newHireId)}
                          className="h-3.5 w-3.5 shrink-0 accent-brand-gold"
                        />
                        <span className="min-w-0 flex-1 truncate text-brand-lea dark:text-slate-100">{r.name}</span>
                        <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">
                          {formatCents(r.balanceCents)}
                          {r.lastEmailedAt ? ` · emailed ${DAY.format(new Date(r.lastEmailedAt))}` : ""}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {blockedCount ? (
                <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
                  {blockedCount} with credit left can&apos;t be emailed (no SkyShare email on file). Copy their link from the
                  balance sheet instead.
                </p>
              ) : null}
            </div>

            {/* What */}
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Subject</span>
              <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            {plan.preview ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
                  Email · shown for {plan.preview.name}
                </p>
                <EmailBodyEditor
                  greeting={plan.preview.greetingHtml}
                  template={plan.bodyHtml}
                  edited={edited}
                  onChange={setEdited}
                  disabled={sending}
                  source="app"
                />
                <div
                  title="Written per person: their own credit and link"
                  className="border-l-[3px] border-brand-lea/20 bg-white px-3 pb-3 text-left text-[12.5px] text-brand-black dark:border-white/20 dark:bg-brand-field dark:text-slate-200 [&_a]:text-[#0b63ce] [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: plan.preview.creditHtml }}
                />
                <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
                  The greeting, the credit amount and the link are filled in for each person. Edits to the middle apply to
                  this send only.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {progress ? <span className="text-sm text-brand-grey dark:text-slate-400">{progress}</span> : null}
              <Button variant="secondary" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={send} disabled={!canSend}>
                {sending ? "Sending…" : `Send to ${chosen.length}`}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
