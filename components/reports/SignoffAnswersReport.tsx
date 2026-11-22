"use client";

import { clsx } from "clsx";
import { R } from "@/components/reports/report-ui";
import type { SignoffAnswers, SignoffQuestion, Who } from "@/lib/quality-of-hire/signoff-form";
import { formatMomentDate } from "@/lib/dates/display";

// Reports > Sign-off - milestone 2 of the Quality of Hire rock. The form's links in
// one findable place, and its answers read live from the answers Sheet, laid out to
// read rather than as a spreadsheet (his ask, Nov 21 2026). One report-ui panel; no
// tables, so nothing scrolls sideways on a phone. Data: lib/quality-of-hire/signoff-form.ts.

export type SignoffReportData = {
  links: { send: string; edit: string; answers: string; page: string };
  departments: string[];
  answers: SignoffAnswers;
};

const whoText = (w: Who) => (w.departments.length ? `${w.name} (${w.departments.join(", ")})` : w.name);

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={R.link}>
      {children}
    </a>
  );
}

function Question({ q, total }: { q: SignoffQuestion; total: number }) {
  const answered = q.kind === "text" ? q.texts.length : new Set(q.tallies.flatMap((t) => t.people.map((p) => p.name))).size;
  return (
    <div className={R.box}>
      <div className={R.listTitle}>{q.title}</div>
      <div className={clsx("text-[11px]", R.muted)}>
        {answered} of {total} answered{q.kind === "multi" ? " · tick all that apply" : ""}
      </div>
      {q.tallies.length ? (
        <ul className="mt-2 space-y-2">
          {q.tallies.map((t) => {
            const pct = total ? (t.people.length / total) * 100 : 0;
            return (
              <li key={t.choice}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 text-brand-lea dark:text-slate-100">{t.choice}</span>
                  <span className={clsx("shrink-0 tabular-nums", R.strong)}>{t.people.length}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-brand-cloudDancer/70 dark:bg-white/10">
                  <i className="block h-full bg-brand-eden dark:bg-brand-sweet" style={{ width: `${pct}%` }} />
                </div>
                <div className={clsx("mt-0.5 text-[11px]", R.muted)}>{t.people.map(whoText).join("; ")}</div>
              </li>
            );
          })}
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
  const { links, departments, answers } = data;
  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div className="min-w-0">
          <div className={R.eyebrow}>Quality of Hire · milestone 2</div>
          <h2 className={R.title}>Definitions sign-off</h2>
          <p className={R.lede}>
            Each department&apos;s hiring manager answers the sign-off questions on a Google Form. Their answers appear here as they come in, read straight from the
            form&apos;s answers Sheet.
          </p>
        </div>
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>Links</div>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          <li className="text-sm">
            <ExtLink href={links.send}>The form</ExtLink>
            <span className={clsx("block text-[11px]", R.muted)}>Send this link to the hiring managers</span>
          </li>
          <li className="text-sm">
            <ExtLink href={links.page}>The sign-off page</ExtLink>
            <span className={clsx("block text-[11px]", R.muted)}>The definitions, today&apos;s numbers and who signs off</span>
          </li>
          <li className="text-sm">
            <ExtLink href={links.edit}>Edit the form</ExtLink>
            <span className={clsx("block text-[11px]", R.muted)}>Change a question or its settings</span>
          </li>
          <li className="text-sm">
            <ExtLink href={links.answers}>Answers Sheet</ExtLink>
            <span className={clsx("block text-[11px]", R.muted)}>The raw answers, one row per person</span>
          </li>
        </ul>
      </div>

      {"error" in answers ? (
        <p className={R.note}>{answers.error}</p>
      ) : (
        <>
          <div className={R.hero}>
            <div className={R.heroRow}>
              <span className={R.heroFigure}>
                {answers.covered.length} of {departments.length}
              </span>
              <span className={R.heroText}>departments have answered</span>
            </div>
            <div className={R.heroSub}>
              {answers.responses.length} answer{answers.responses.length === 1 ? "" : "s"} so far. Read from the Sheet {formatMomentDate(answers.readAt)}; reload for the latest.
            </div>
          </div>

          <div className={R.box}>
            <div className={R.sectionLabel}>Still to answer - {answers.missing.length}</div>
            {answers.missing.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {answers.missing.map((d) => (
                  <li key={d} className={R.chip}>
                    {d}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={R.footnote}>Every department has answered.</p>
            )}
          </div>

          <div className={R.box}>
            <div className={R.sectionLabel}>Who has answered - {answers.responses.length}</div>
            {answers.responses.length ? (
              <ul className={clsx("mt-2", R.tbody)}>
                {answers.responses.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className={R.strong}>{r.name}</span>
                      <span className={clsx("block text-[11px]", R.muted)}>{r.departments.join(", ") || "No department ticked"}</span>
                    </span>
                    <span className={clsx("text-[11px]", R.muted)}>{r.at}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={R.footnote}>Nobody has answered yet.</p>
            )}
          </div>

          {answers.questions.map((q) => (
            <Question key={q.title} q={q} total={answers.responses.length} />
          ))}
        </>
      )}
    </section>
  );
}
