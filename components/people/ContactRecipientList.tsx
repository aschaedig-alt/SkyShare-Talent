"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { SupervisorResult } from "@/components/people/SupervisorPicker";

// Who a new hire's contact card goes to — the recipient list inside
// SendSupervisorContactButton (asked for Nov 19 2026: send it to "2 supervisors
// linked to the new hire and another supervisor", choosing who).
//
// The linked supervisors arrive pre-ticked from the server. Anyone else can be
// added from the employee roster (the same /api/new-hires/supervisor-search the
// supervisor picker uses, so the address is the one on their record) or, failing
// that, by typing an address. Nothing here sends; the parent re-previews on every
// change so the To line and greeting are what will actually go out.

export type RecipientRow = {
  key: string;
  name: string | null;
  email: string | null;
  /** Small grey note under the name — "Supervisor", a position, "Typed address". */
  detail: string | null;
  checked: boolean;
};

const EMAIL_SHAPE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export function ContactRecipientList({
  hireId,
  rows,
  onChange,
  disabled = false,
}: {
  hireId: string;
  rows: RecipientRow[];
  onChange: (rows: RecipientRow[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SupervisorResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [typedError, setTypedError] = useState<string | null>(null);

  const has = (email: string | null) =>
    Boolean(email) && rows.some((r) => r.email?.toLowerCase() === email?.toLowerCase());

  // Same in-flight guard as SupervisorPicker: a slow response for an older query
  // must not repaint results under the one being typed now.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || term.includes("@")) {
      setResults([]);
      setFailed(false);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setFailed(false);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/new-hires/supervisor-search?q=${encodeURIComponent(term)}&exclude=${encodeURIComponent(hireId)}`
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { people?: SupervisorResult[] };
        if (!cancelled) setResults(data.people ?? []);
      } catch {
        if (!cancelled) {
          setResults([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, hireId]);

  function toggle(key: string) {
    onChange(rows.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)));
  }

  function remove(key: string) {
    onChange(rows.filter((r) => r.key !== key));
  }

  function addPerson(p: SupervisorResult) {
    if (!p.email) return;
    if (has(p.email)) {
      // Already listed (e.g. a linked supervisor she unticked) — tick it rather
      // than listing the same person twice.
      onChange(rows.map((r) => (r.email?.toLowerCase() === p.email?.toLowerCase() ? { ...r, checked: true } : r)));
    } else {
      onChange([
        ...rows,
        { key: `person-${p.id}`, name: p.name, email: p.email, detail: p.position, checked: true },
      ]);
    }
    setQ("");
    setResults([]);
  }

  function addTyped() {
    const email = q.trim();
    if (!EMAIL_SHAPE.test(email)) {
      setTypedError("That doesn't look like an email address.");
      return;
    }
    setTypedError(null);
    if (has(email)) {
      onChange(rows.map((r) => (r.email?.toLowerCase() === email.toLowerCase() ? { ...r, checked: true } : r)));
    } else {
      onChange([...rows, { key: `typed-${email.toLowerCase()}`, name: null, email, detail: "Typed address", checked: true }]);
    }
    setQ("");
  }

  const looksLikeEmail = q.includes("@");

  return (
    <div className="mt-3 rounded border border-brand-lea/12 p-3 dark:border-white/10">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Send to</p>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">Nobody yet &mdash; add someone below.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => {
            const isLinked = r.key.startsWith("linked-");
            return (
              <li key={r.key} className="flex items-start gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-brand-cloudDancer/40 dark:hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={r.checked}
                    disabled={disabled || !r.email}
                    onChange={() => toggle(r.key)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-lea"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-brand-black dark:text-slate-100">
                      {r.name ?? r.email}
                      {r.detail ? (
                        <span className="ml-1.5 text-[11px] text-brand-grey dark:text-slate-400">{r.detail}</span>
                      ) : null}
                    </span>
                    <span className="block break-all text-[11px] text-brand-grey dark:text-slate-400">
                      {r.email ?? "No email on file — can't be sent to"}
                    </span>
                  </span>
                </label>
                {!isLinked ? (
                  <button
                    type="button"
                    onClick={() => remove(r.key)}
                    disabled={disabled}
                    aria-label={`Remove ${r.name ?? r.email}`}
                    className="mt-1 shrink-0 rounded p-1 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3">
        <label className="block text-xs font-semibold text-brand-grey dark:text-slate-400">
          Add someone
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setTypedError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (looksLikeEmail) addTyped();
                  else if (results.length === 1) addPerson(results[0]);
                }
              }}
              disabled={disabled}
              placeholder="Search a name, or type an email address"
              className="block w-full min-w-0 rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-sm font-normal text-brand-black outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
            />
            {looksLikeEmail ? (
              <button
                type="button"
                onClick={addTyped}
                disabled={disabled}
                className="shrink-0 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              >
                Add
              </button>
            ) : null}
          </div>
        </label>

        {typedError ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">{typedError}</p> : null}

        {!looksLikeEmail && q.trim().length >= 2 ? (
          <div className="mt-1 rounded border border-brand-lea/10 dark:border-white/10">
            {searching ? (
              <p className="px-2 py-1.5 text-xs text-brand-grey dark:text-slate-400">Searching&hellip;</p>
            ) : failed ? (
              <p className="px-2 py-1.5 text-xs text-red-700 dark:text-red-300">The search failed &mdash; try again.</p>
            ) : results.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-brand-grey dark:text-slate-400">
                Nobody by that name &mdash; you can type their email address instead.
              </p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addPerson(p)}
                  disabled={disabled || !p.email}
                  className="block w-full px-2 py-1.5 text-left transition hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:hover:bg-white/5"
                >
                  <span className="block text-sm text-brand-lea dark:text-slate-100">
                    {p.name}
                    {has(p.email) ? (
                      <span className="ml-1.5 text-[11px] text-brand-grey dark:text-slate-400">already listed</span>
                    ) : null}
                  </span>
                  <span className="block break-all text-[11px] text-brand-grey dark:text-slate-400">
                    {[p.position, p.email ?? "no email on file"].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
