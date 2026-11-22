"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  SIGNOFF_ANYTHING_ELSE,
  SIGNOFF_DEFINITIONS,
  SIGNOFF_DEPARTMENTS,
  SIGNOFF_DUE,
  SIGNOFF_QUESTIONS,
  missingSignoffAnswers,
  type SignoffAnswer,
  type SignoffAnswers,
  type SignoffQuestion
} from "@/lib/quality-of-hire/signoff-questions";

// The hiring manager's no-login sign-off form (/signoff/<token>). Same questions as
// lib/quality-of-hire/signoff-questions.ts, in three parts like the Google Form it
// replaced. Phone first: one column, big tap targets, nothing wider than the screen.

const card = "mt-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const h2 = "text-lg font-semibold text-brand-lea dark:text-slate-100";
const help = "mt-1 text-xs leading-relaxed text-brand-grey dark:text-slate-400";
const field =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100";
const option = "flex items-start gap-2.5 rounded border border-brand-lea/10 px-3 py-2 text-sm text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100";

function emptyAnswers(name: string, departments: string[]): SignoffAnswers {
  return {
    name,
    departments,
    otherDepartment: "",
    byKey: Object.fromEntries(SIGNOFF_QUESTIONS.map((q) => [q.key, { picked: [], text: "" }])),
    anythingElse: ""
  };
}

function Question({ q, value, onChange }: { q: SignoffQuestion; value: SignoffAnswer; onChange: (v: SignoffAnswer) => void }) {
  const name = `sq-${q.key}`;
  return (
    <fieldset className="mt-5 first:mt-3">
      <legend className="text-sm font-semibold text-brand-lea dark:text-slate-100">
        {q.num}. {q.title}
        {q.required ? <span className="text-red-700 dark:text-red-300"> *</span> : null}
      </legend>
      {q.help ? <p className={help}>{q.help}</p> : null}
      {q.kind === "text" ? (
        <textarea id={name} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} rows={3} className={clsx(field, "mt-2")} />
      ) : (
        <div className="mt-2 grid gap-1.5">
          {(q.choices ?? []).map((c) => {
            const on = value.picked.includes(c);
            return (
              <label key={c} className={clsx(option, on && "border-brand-lea ring-1 ring-brand-gold dark:border-brand-gold/60")}>
                <input
                  type={q.kind === "multi" ? "checkbox" : "radio"}
                  name={name}
                  checked={on}
                  onChange={() =>
                    onChange(
                      q.kind === "multi"
                        ? { ...value, picked: on ? value.picked.filter((p) => p !== c) : [...value.picked, c] }
                        : { picked: [c], text: "" }
                    )
                  }
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>{c}</span>
              </label>
            );
          })}
          {q.other ? (
            <label className="mt-1 grid gap-1 text-xs font-semibold text-brand-grey dark:text-slate-400">
              {q.kind === "multi" ? "Other (anything missing)" : "Other - write your own answer"}
              <input
                value={value.text}
                onChange={(e) => onChange(q.kind === "multi" ? { ...value, text: e.target.value } : { picked: e.target.value.trim() ? [] : value.picked, text: e.target.value })}
                className={clsx(field, "font-normal")}
              />
            </label>
          ) : null}
        </div>
      )}
    </fieldset>
  );
}

export function SignoffForm({ token, toName, departments }: { token: string; toName: string | null; departments: string[] }) {
  const [a, setA] = useState<SignoffAnswers>(() => emptyAnswers(toName ?? "", departments));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const missing = missingSignoffAnswers(a);

  const setQ = (key: string, v: SignoffAnswer) => setA((cur) => ({ ...cur, byKey: { ...cur.byKey, [key]: v } }));

  async function send() {
    if (missing.length) {
      setError(`Still needed: ${missing.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/signoff/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: a }) });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "Could not send your answers. Please try again.");
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your answers. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={clsx(card, "text-center")}>
        <h2 className={h2}>Thank you - that is your sign-off</h2>
        <p className={help}>HR will write the final definitions from everyone&apos;s answers and share them with you. There is nothing more to approve.</p>
      </div>
    );
  }

  const section = (s: SignoffQuestion["section"]) =>
    SIGNOFF_QUESTIONS.filter((q) => q.section === s).map((q) => <Question key={q.key} q={q} value={a.byKey[q.key]} onChange={(v) => setQ(q.key, v)} />);

  return (
    <div>
      <div className={card}>
        <p className="text-sm leading-relaxed text-brand-lea dark:text-slate-200">
          We want to learn which hires worked out and which did not, so the next ones go better. Each department&apos;s hiring manager confirms or corrects how
          &quot;good hire&quot; and &quot;bad hire&quot; are decided for their people, and what we measure each quarter.
        </p>
        <p className={clsx(help, "text-sm")}>
          <b className="text-brand-lea dark:text-slate-100">This form is your sign-off: there is no second round.</b> Please answer by {SIGNOFF_DUE}. About 15
          minutes. Where there is a recommendation it is marked.
        </p>
      </div>

      <div className={card}>
        <h2 className={h2}>About you</h2>
        <label className="mt-3 grid gap-1 text-sm font-semibold text-brand-lea dark:text-slate-100">
          Your name <span className="sr-only">(required)</span>
          <input id="so-name" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} className={clsx(field, "font-normal")} />
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-brand-lea dark:text-slate-100">Which department(s) are you answering for?</legend>
          <p className={help}>HR ticked the ones they expect; change them if they are wrong.</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {SIGNOFF_DEPARTMENTS.map((d) => {
              const on = a.departments.includes(d);
              return (
                <label key={d} className={clsx(option, on && "border-brand-lea ring-1 ring-brand-gold dark:border-brand-gold/60")}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setA({ ...a, departments: on ? a.departments.filter((x) => x !== d) : [...a.departments, d] })}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{d}</span>
                </label>
              );
            })}
          </div>
          <label className="mt-2 grid gap-1 text-xs font-semibold text-brand-grey dark:text-slate-400">
            Other
            <input value={a.otherDepartment} onChange={(e) => setA({ ...a, otherDepartment: e.target.value })} className={clsx(field, "font-normal")} />
          </label>
        </fieldset>
      </div>

      <div className={card}>
        <h2 className={h2}>The draft definitions</h2>
        <p className={help}>Each hire gets one of these, measured from their start date. They judge the hiring decision, not the person.</p>
        <dl className="mt-3 grid gap-2">
          {SIGNOFF_DEFINITIONS.map((d) => (
            <div key={d.name} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <dt className="text-sm font-semibold text-brand-lea dark:text-slate-100">{d.name}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-brand-grey dark:text-slate-400">{d.text}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={card}>
        <h2 className={h2}>About the definitions</h2>
        {section("definitions")}
      </div>

      <div className={card}>
        <h2 className={h2}>About your department</h2>
        {section("department")}
        <label className="mt-5 grid gap-1 text-sm font-semibold text-brand-lea dark:text-slate-100">
          {SIGNOFF_ANYTHING_ELSE}
          <textarea id="so-else" value={a.anythingElse} onChange={(e) => setA({ ...a, anythingElse: e.target.value })} rows={3} className={clsx(field, "font-normal")} />
        </label>
      </div>

      <div className={card}>
        <h2 className={h2}>Your sign-off</h2>
        {section("signoff")}
        {error ? <p className="mt-4 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="mt-5 w-full rounded bg-brand-lea px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send my sign-off"}
        </button>
        {missing.length ? <p className={clsx(help, "text-center")}>Still needed: {missing.join(", ")}.</p> : null}
      </div>
    </div>
  );
}
