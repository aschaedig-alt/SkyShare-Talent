"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { R } from "@/components/reports/report-ui";
import { summarizeSignoffs, type SummaryQuestion, type Who } from "@/lib/quality-of-hire/signoff-form";
import { SIGNOFF_DEPARTMENTS, SIGNOFF_DUE, SIGNOFF_STATE_LABEL, type SignoffRequestView } from "@/lib/quality-of-hire/signoff-questions";
import { SignoffSendDialog } from "@/components/reports/SignoffSendDialog";
import { SignoffBulkSendDialog } from "@/components/reports/SignoffBulkSendDialog";
import { formatMomentDate, formatMomentDateShort } from "@/lib/dates/display";

// Reports > Sign-off - milestone 2 of the Quality of Hire rock. HR sends each hiring
// manager a no-login sign-off link from here, sees who has answered, and reads the
// answers laid out per question (his asks, Nov 21 2026). One report-ui panel; no
// tables, so nothing scrolls sideways on a phone. Admins only (app/reports/page.tsx).

export type SignoffReportData = { requests: SignoffRequestView[]; pageUrl: string };

const whoText = (w: Who) => (w.departments.length ? `${w.name} (${w.departments.join(", ")})` : w.name);

const CHIP: Record<string, string> = {
  PENDING: "border-sky-300/70 text-sky-800 dark:border-sky-500/40 dark:text-sky-300",
  COMPLETED: "border-emerald-300/70 text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-300",
  EXPIRED: "border-amber-300/70 text-amber-800 dark:border-amber-500/40 dark:text-amber-300",
  CANCELLED: "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400"
};

function Question({ q, total }: { q: SummaryQuestion; total: number }) {
  const answered = q.kind === "text" ? q.texts.length : new Set([...q.tallies.flatMap((t) => t.people.map((p) => p.name)), ...q.texts.map((t) => t.who.name)]).size;
  return (
    <div className={R.box}>
      <div className={R.listTitle}>{q.title}</div>
      <div className={clsx("text-[11px]", R.muted)}>
        {answered} of {total} answered{q.kind === "multi" ? " · tick all that apply" : ""}
      </div>
      {q.tallies.length ? (
        <ul className="mt-2 space-y-2">
          {q.tallies.map((t) => (
            <li key={t.choice}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 text-brand-lea dark:text-slate-100">{t.choice}</span>
                <span className={clsx("shrink-0 tabular-nums", R.strong)}>{t.people.length}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-brand-cloudDancer/70 dark:bg-white/10">
                <i className="block h-full bg-brand-eden dark:bg-brand-sweet" style={{ width: `${total ? (t.people.length / total) * 100 : 0}%` }} />
              </div>
              <div className={clsx("mt-0.5 text-[11px]", R.muted)}>{t.people.map(whoText).join("; ")}</div>
            </li>
          ))}
        </ul>
      ) : null}
      {q.texts.length ? (
        <ul className="mt-2 space-y-2">
          {q.texts.map((t, i) => (
            <li key={i} className={clsx(R.note, "mt-0")}>
              <span className={clsx("block text-[11px] font-semibold", R.muted)}>
                {whoText(t.who)}
                {q.kind !== "text" ? " · Other" : ""}
              </span>
              <span className="whitespace-pre-line text-brand-lea dark:text-slate-200">{t.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!q.tallies.length && !q.texts.length ? <p className={R.footnote}>No answers yet.</p> : null}
    </div>
  );
}

export function SignoffAnswersReport({ data }: { data: SignoffReportData }) {
  const [requests, setRequests] = useState<SignoffRequestView[]>(data.requests);
  const [dialog, setDialog] = useState<{ request: SignoffRequestView | null } | null>(null);
  const [bulk, setBulk] = useState(false);
  const s = useMemo(() => summarizeSignoffs(requests), [requests]);
  const upsert = (v: SignoffRequestView) => setRequests((cur) => [v, ...cur.filter((r) => r.id !== v.id)]);
  const signedOff = s.questions.find((q) => q.key === "q14");

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div className="min-w-0">
          <div className={R.eyebrow}>Quality of Hire · milestone 2</div>
          <h2 className={R.title}>Definitions sign-off</h2>
          <p className={R.lede}>
            Each department&apos;s hiring manager answers a short no-login form, sent from here. Their answer to question 14 is the department&apos;s sign-off; there is
            one round. Answers due {SIGNOFF_DUE}.
          </p>
        </div>
        <div className={R.controls}>
          <button type="button" onClick={() => setBulk(true)} className={R.pageButton}>
            Send sign-off links
          </button>
        </div>
      </div>

      <div className={R.hero}>
        <div className={R.heroRow}>
          <span className={R.heroFigure}>
            {s.covered.length} of {SIGNOFF_DEPARTMENTS.length}
          </span>
          <span className={R.heroText}>departments have signed off</span>
        </div>
        <div className={R.heroSub}>
          {s.responses.length} sign-off{s.responses.length === 1 ? "" : "s"} in · {s.waiting.length} department{s.waiting.length === 1 ? "" : "s"} waiting on a link ·{" "}
          {s.notSent.length} not sent yet
        </div>
      </div>

      <div className="grid gap-x-5 lg:grid-cols-2">
        <div className={R.box}>
          <div className={R.sectionLabel}>Not sent yet - {s.notSent.length}</div>
          {s.notSent.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {s.notSent.map((d) => (
                <li key={d} className={R.chip}>
                  {d}
                </li>
              ))}
            </ul>
          ) : (
            <p className={R.footnote}>Every department has a link.</p>
          )}
        </div>
        <div className={R.box}>
          <div className={R.sectionLabel}>Waiting on an answer - {s.waiting.length}</div>
          {s.waiting.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {s.waiting.map((d) => (
                <li key={d} className={R.chip}>
                  {d}
                </li>
              ))}
            </ul>
          ) : (
            <p className={R.footnote}>Nobody is waiting.</p>
          )}
        </div>
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>Links sent - {requests.length}</div>
        {requests.length ? (
          <ul className={clsx("mt-2", R.tbody)}>
            {requests.map((r) => {
              const open = r.state === "PENDING" || r.state === "EXPIRED";
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className={R.strong}>{r.toName ?? r.to}</span>
                    <span className={clsx("block text-[11px]", R.muted)}>
                      {r.toName ? `${r.to} · ` : ""}
                      {r.departments.join(", ")}
                    </span>
                  </span>
                  <span className={clsx(R.chip, CHIP[r.state])}>{SIGNOFF_STATE_LABEL[r.state]}</span>
                  <span className={clsx("text-[11px]", R.muted)}>
                    {r.state === "COMPLETED"
                      ? `signed off ${formatMomentDateShort(r.completedAt)}`
                      : r.state === "PENDING"
                        ? `sent ${formatMomentDateShort(r.lastSentAt)}, works until ${formatMomentDateShort(r.expiresAt)}`
                        : r.state === "EXPIRED"
                          ? `expired ${formatMomentDateShort(r.expiresAt)}`
                          : `cancelled ${formatMomentDateShort(r.cancelledAt)}`}
                  </span>
                  {open ? (
                    <button type="button" onClick={() => setDialog({ request: r })} className={R.smallButton}>
                      Resend or cancel
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={R.footnote}>No links sent yet. Use &quot;Send sign-off links&quot; to pick who gets one.</p>
        )}
        <p className={R.footnote}>
          Who signs off for each department is on the{" "}
          <a href={data.pageUrl} target="_blank" rel="noreferrer" className={R.link}>
            sign-off page
          </a>
          .
        </p>
      </div>

      {signedOff && signedOff.tallies.length ? <Question q={signedOff} total={s.responses.length} /> : null}

      <div className={R.box}>
        <div className={R.sectionLabel}>Who has signed off - {s.responses.length}</div>
        {s.responses.length ? (
          <ul className={clsx("mt-2", R.tbody)}>
            {s.responses.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className={R.strong}>{r.name}</span>
                  <span className={clsx("block text-[11px]", R.muted)}>{r.departments.join(", ") || "No department ticked"}</span>
                </span>
                <span className={clsx("text-[11px]", R.muted)}>{formatMomentDate(r.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={R.footnote}>Nobody has signed off yet.</p>
        )}
      </div>

      {s.questions
        .filter((q) => q.key !== "q14")
        .map((q) => (
          <Question key={q.key} q={q} total={s.responses.length} />
        ))}

      {dialog ? <SignoffSendDialog request={dialog.request} onClose={() => setDialog(null)} onChanged={upsert} /> : null}
      {bulk ? <SignoffBulkSendDialog onClose={() => setBulk(false)} onSent={(views) => views.forEach(upsert)} /> : null}
    </section>
  );
}
