"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Modal } from "@/components/ui/Modal";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import {
  SIGNOFF_DEPARTMENTS,
  SIGNOFF_LINK_DAYS,
  defaultSignoffBodyHtml,
  defaultSignoffSubject,
  looksLikeEmail,
  signoffGreetingHtml,
  type SignoffRecipient,
  type SignoffRecipientList,
  type SignoffRequestView
} from "@/lib/quality-of-hire/signoff-questions";

// Send sign-off links to whoever HR picks (his ask, Nov 21 2026: "a list of all of
// the SkyShare employees so that I can send it to whoever I want to select, maybe
// putting the hiring manager first ... then let me add others ... like a multiple
// select"). Suggested sign-offs come first with their departments ticked; every
// current employee is below; anyone else can be added by email. ONE email, edited
// once, and every person gets their own email and their own link.

type Pick = { name: string; email: string; departments: string[]; source: "suggested" | "employee" | "added" };
type Result = { sent: SignoffRequestView[]; skipped: { name: string; reason: string }[]; failed: { name: string; error: string }[]; warnings: string[] };

function DeptPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {SIGNOFF_DEPARTMENTS.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            aria-pressed={on}
            className={clsx(
              "rounded border px-1.5 py-0.5 text-[11px] font-semibold transition",
              on ? "border-brand-lea bg-brand-lea text-white ring-1 ring-brand-gold" : "border-brand-lea/15 text-brand-grey hover:shadow-glow dark:border-white/10 dark:text-slate-400"
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

function PersonRow({
  person,
  picked,
  onToggle,
  onDepartments
}: {
  person: SignoffRecipient;
  picked: Pick | undefined;
  onToggle: () => void;
  onDepartments: (v: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className={clsx("rounded border px-3 py-2", picked ? "border-brand-lea/40 bg-brand-cloudDancer/40 dark:border-brand-gold/40 dark:bg-white/5" : "border-brand-lea/10 dark:border-white/10")}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={Boolean(picked)} onChange={onToggle} className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-lea dark:text-slate-100">{person.name}</span>
          <span className="block truncate text-[11px] text-brand-grey dark:text-slate-400">{[person.position, person.email].filter(Boolean).join(" · ")}</span>
        </span>
      </label>
      {picked ? (
        <div className="ml-6 mt-1 text-[11px] text-brand-grey dark:text-slate-400">
          <span>{picked.departments.length ? `Signs off for ${picked.departments.join(", ")}` : "No department ticked - they will tick their own on the form"}</span>{" "}
          <button type="button" onClick={() => setEditing((e) => !e)} className="font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-edenOnDark">
            {editing ? "Done" : "Change"}
          </button>
          {editing ? <DeptPicker value={picked.departments} onChange={onDepartments} /> : null}
        </div>
      ) : null}
    </li>
  );
}

export function SignoffBulkSendDialog({ onClose, onSent }: { onClose: () => void; onSent: (views: SignoffRequestView[]) => void }) {
  const [list, setList] = useState<SignoffRecipientList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [added, setAdded] = useState<Pick[]>([]);
  const [q, setQ] = useState("");
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [subject, setSubject] = useState(defaultSignoffSubject());
  const [body, setBody] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/quality-of-hire/signoff-requests?recipients=1")
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as SignoffRecipientList & { message?: string };
        if (!r.ok) throw new Error(d.message || "Could not load the employee list.");
        if (live) setList(d);
      })
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : "Could not load the employee list."));
    return () => {
      live = false;
    };
  }, []);

  const suggestedDepts = useMemo(() => new Map((list?.suggested ?? []).map((s) => [s.recipient.id, s.departments])), [list]);
  const toggle = (p: SignoffRecipient, source: Pick["source"]) =>
    setPicks((cur) => {
      const next = { ...cur };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = { name: p.name, email: p.email, departments: suggestedDepts.get(p.id) ?? [], source };
      return next;
    });
  const setDepts = (id: string, departments: string[]) => setPicks((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id], departments } } : cur));

  const needle = q.trim().toLowerCase();
  const matches = (p: SignoffRecipient) => !needle || `${p.name} ${p.position ?? ""} ${p.email}`.toLowerCase().includes(needle);
  const chosen = [...Object.values(picks), ...added];
  const sample = chosen[0];

  function addOther() {
    const email = addEmail.trim();
    if (!looksLikeEmail(email)) return;
    if (chosen.some((c) => c.email.toLowerCase() === email.toLowerCase())) return;
    setAdded((cur) => [...cur, { name: addName.trim() || email, email, departments: [], source: "added" }]);
    setAddName("");
    setAddEmail("");
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/quality-of-hire/signoff-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sendMany", recipients: chosen.map((c) => ({ name: c.name, email: c.email, departments: c.departments })), subject, body })
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Result> & { message?: string };
      if (!res.ok) throw new Error(data.message || "Could not send.");
      const r: Result = { sent: data.sent ?? [], skipped: data.skipped ?? [], failed: data.failed ?? [], warnings: data.warnings ?? [] };
      setResult(r);
      if (r.sent.length) onSent(r.sent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  const label = "text-xs font-semibold text-brand-lea dark:text-slate-100";
  const field =
    "w-full min-w-0 rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100";

  return (
    <Modal open onClose={onClose} busy={busy} maxWidth="max-w-2xl" title="Send sign-off links">
      <div className="p-5 text-left">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Send sign-off links</h2>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          Tick everyone who should sign off. Each person gets their own email and their own no-login link, which works once, for {SIGNOFF_LINK_DAYS} days.
        </p>

        {result ? (
          <div className="mt-4 space-y-2 text-sm">
            {result.sent.length ? (
              <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                Sent to {result.sent.length}: {result.sent.map((s) => s.toName ?? s.to).join(", ")}.
              </div>
            ) : null}
            {result.skipped.length ? (
              <div className="rounded border border-brand-lea/15 px-3 py-2 text-brand-grey dark:border-white/10 dark:text-slate-400">
                Skipped {result.skipped.length}: {result.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}.
              </div>
            ) : null}
            {result.failed.length ? (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                Not sent to {result.failed.length}: {result.failed.map((f) => `${f.name} (${f.error})`).join("; ")}.
              </div>
            ) : null}
            {result.warnings.map((w) => (
              <p key={w} className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {w}
              </p>
            ))}
          </div>
        ) : (
          <>
            {loadError ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{loadError}</p> : null}
            {!list && !loadError ? <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">Loading the employee list…</p> : null}
            {list ? (
              <>
                <input id="so-bulk-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, title or email" className={clsx(field, "mt-4")} />

                <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
                  <span className={label}>Who signs off ({list.suggested.length})</span>
                  <button
                    type="button"
                    onClick={() => list.suggested.forEach((s) => !picks[s.recipient.id] && toggle(s.recipient, "suggested"))}
                    className="text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-edenOnDark"
                  >
                    Select all of them
                  </button>
                </div>
                {list.unmatched.length ? (
                  <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">Not found among current employees, so pick them below: {list.unmatched.join(", ")}.</p>
                ) : null}
                <ul className="mt-2 grid gap-1.5">
                  {list.suggested
                    .filter((s) => matches(s.recipient))
                    .map((s) => (
                      <PersonRow key={s.recipient.id} person={s.recipient} picked={picks[s.recipient.id]} onToggle={() => toggle(s.recipient, "suggested")} onDepartments={(v) => setDepts(s.recipient.id, v)} />
                    ))}
                </ul>

                <div className={clsx("mt-5", label)}>Everyone else ({list.others.length})</div>
                <ul className="mt-2 grid gap-1.5">
                  {list.others.filter(matches).map((p) => (
                    <PersonRow key={p.id} person={p} picked={picks[p.id]} onToggle={() => toggle(p, "employee")} onDepartments={(v) => setDepts(p.id, v)} />
                  ))}
                </ul>

                <div className={clsx("mt-5", label)}>Someone not on the list</div>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input id="so-add-name" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name" className={field} />
                  <input id="so-add-email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="name@skyshare.com" className={field} />
                  <button
                    type="button"
                    onClick={addOther}
                    disabled={!looksLikeEmail(addEmail)}
                    className="rounded border border-brand-lea/20 px-3 py-2 text-xs font-semibold text-brand-lea transition hover:shadow-glow disabled:opacity-50 dark:border-white/10 dark:text-slate-100"
                  >
                    Add
                  </button>
                </div>
                {added.length ? (
                  <ul className="mt-2 grid gap-1">
                    {added.map((a) => (
                      <li key={a.email} className="flex items-center justify-between gap-2 text-sm text-brand-lea dark:text-slate-100">
                        <span className="min-w-0 truncate">
                          {a.name} <span className="text-[11px] text-brand-grey dark:text-slate-400">{a.email}</span>
                        </span>
                        <button type="button" onClick={() => setAdded((cur) => cur.filter((x) => x.email !== a.email))} className="text-xs font-semibold text-brand-grey hover:text-red-700">
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <label className={clsx("mt-5 grid gap-1", label)}>
                  Subject
                  <input id="so-bulk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
                </label>
                <div className="mt-3">
                  <EmailBodyEditor
                    greeting={signoffGreetingHtml(sample?.name ?? null)}
                    template={defaultSignoffBodyHtml(sample?.departments ?? [])}
                    edited={body}
                    onChange={setBody}
                    disabled={busy}
                    source="app"
                    note="The sign-off link is added under this message when it sends, so editing the wording cannot lose it."
                  />
                  <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">
                    {body === null
                      ? `Shown for ${sample?.name ?? "the first person you tick"}. As written, each person's copy has their own first name and departments.`
                      : "Edited: everyone gets this exact wording, with their own first name in the greeting."}{" "}
                    hrotasks@ is copied, as on the other sends.
                  </p>
                </div>
              </>
            ) : null}
          </>
        )}

        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
            Close
          </button>
          {!result ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !chosen.length}
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
            >
              {busy ? "Sending…" : `Send to ${chosen.length} ${chosen.length === 1 ? "person" : "people"}`}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
