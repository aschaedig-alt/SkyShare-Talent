"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Button, Modal } from "@/components/ui";
import { ORIENTATION_TEMPLATE_META, type OrientationTemplateKey } from "@/lib/orientation/email-templates-meta";
import { previewOrientationEmail, sendOrientationEmail } from "@/app/orientation/actions";
import type { OrientationEmailPreview } from "@/lib/front/orientation-email";

// Sending orientation email, and tracking who has had what.
//
// Two deliberate rules, because a send is irreversible and lands in a real new
// hire's inbox:
//  1. Nothing sends without a PREVIEW of the exact email, approved first.
//  2. A test send goes to ONE address with no cc, and never ticks the grid.
//
// The tick itself stays hand-toggleable: an email sent from Front directly still
// needs recording, so the checkbox is not disabled just because a Send button exists.

type AttendeeRow = { id: string; name: string; sentTemplateKeys: string[] };

export function OrientationEmailPanel({
  attendees,
  onToggle,
  onSent
}: {
  attendees: AttendeeRow[];
  onToggle: (attendeeId: string, key: string) => void;
  /** Called after a real send so the parent can refresh its state. */
  onSent: (attendeeId: string, key: OrientationTemplateKey) => void;
}) {
  const [target, setTarget] = useState<{ attendee: AttendeeRow; key: OrientationTemplateKey } | null>(null);

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Orientation email</h2>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        Sends the team&apos;s own Front templates, from hrotasks@. The wording is whatever the template says in Front right now —
        the app fills in the date, the recipients, and strips the red &ldquo;delete this part&rdquo; note. Every send is previewed first.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
              <th className="py-2 pr-3">Attendee</th>
              {ORIENTATION_TEMPLATE_META.map((t) => (
                <th key={t.key} className="px-2 py-2 text-center" style={{ minWidth: 118 }} title={t.hint}>
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attendees.map((a) => (
              <tr key={a.id} className="border-t border-brand-lea/10 dark:border-white/10">
                <td className="py-2 pr-3 font-medium text-brand-lea dark:text-slate-100">{a.name}</td>
                {ORIENTATION_TEMPLATE_META.map((t) => {
                  const sent = a.sentTemplateKeys.includes(t.key);
                  return (
                    <td key={t.key} className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onToggle(a.id, t.key)}
                          aria-label={sent ? `Mark ${t.label} as not sent for ${a.name}` : `Mark ${t.label} as sent for ${a.name}`}
                          title="Tick by hand — for an email you sent from Front directly"
                          className="inline-flex items-center justify-center rounded p-0.5 transition hover:bg-brand-gold/10"
                        >
                          {sent ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              <svg width="11" height="11" viewBox="0 0 12 12">
                                <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          ) : (
                            <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/30" />
                          )}
                        </button>
                        <button
                          onClick={() => setTarget({ attendee: a, key: t.key })}
                          className="rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                        >
                          {sent ? "Resend…" : "Send…"}
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CcEditor />

      {target ? (
        <SendDialog
          attendee={target.attendee}
          templateKey={target.key}
          onClose={() => setTarget(null)}
          onSent={(key) => {
            onSent(target.attendee.id, key);
            setTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

// --- the preview + send dialog ---------------------------------------------

function SendDialog({
  attendee,
  templateKey,
  onClose,
  onSent
}: {
  attendee: AttendeeRow;
  templateKey: OrientationTemplateKey;
  onClose: () => void;
  onSent: (key: OrientationTemplateKey) => void;
}) {
  const meta = ORIENTATION_TEMPLATE_META.find((t) => t.key === templateKey)!;
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<OrientationEmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // Test mode redirects the whole email to one address and drops every cc.
  const [testMode, setTestMode] = useState(false);
  const [testTo, setTestTo] = useState("hrotasks@skyshare.com");

  // Rebuild the preview whenever the mode changes, so what is on screen is always
  // what would actually be sent under the current settings.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    previewOrientationEmail(attendee.id, templateKey, testMode ? testTo : null)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.preview) setPreview(res.preview);
        else setError(res.error ?? "Couldn't build the email.");
      })
      .catch(() => !cancelled && setError("Couldn't build the email."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attendee.id, templateKey, testMode, testTo]);

  async function doSend() {
    if (!preview) return;
    const who = testMode ? `TEST to ${preview.to}` : `${attendee.name} at ${preview.to}`;
    if (!confirm(`Send "${meta.label}" — ${who}?\n\nThis sends immediately and cannot be undone.`)) return;
    setSending(true);
    setResult(null);
    const res = await sendOrientationEmail(attendee.id, templateKey, testMode ? testTo : null);
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "Send failed.");
      return;
    }
    if (testMode) {
      setResult(`Test sent to ${res.to}. Nothing was recorded against ${attendee.name}.`);
    } else {
      onSent(templateKey);
    }
  }

  return (
    <Modal open onClose={onClose} busy={sending}>
      <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
        {meta.label} · {attendee.name}
      </h2>
      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">{meta.hint}</p>

      {/* Test mode first: it changes who the email goes to, so it belongs above
          the preview it affects rather than buried under it. */}
      <div className="mt-3 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-2.5 dark:border-white/10 dark:bg-white/5">
        <label className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          Send as a test
        </label>
        {testMode ? (
          <div className="mt-2">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="test@skyshare.com"
              className="w-full rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
              Goes only here, ccs nobody, and does not tick the grid. The body is identical to the real email.
            </p>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Building the email from Front…</p>
      ) : error ? (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </div>
      ) : preview ? (
        <div className="mt-4 space-y-2">
          {preview.warnings.length > 0 ? (
            <ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          <dl className="space-y-1 text-[12.5px]">
            <Row label="To">
              <span className={clsx("font-medium", preview.toSource === "test" && "text-amber-700 dark:text-amber-300")}>
                {preview.to}
              </span>
              <span className="ml-1.5 text-brand-grey dark:text-slate-400">
                ({preview.toSource === "test" ? "test address" : preview.toSource === "supervisor" ? "supervisor" : `${preview.toSource} email`})
              </span>
            </Row>
            <Row label="Cc">{preview.cc.length ? preview.cc.join(", ") : <span className="text-brand-grey dark:text-slate-400">nobody</span>}</Row>
            <Row label="Subject">
              <span className="font-medium">{preview.subject}</span>
            </Row>
            <Row label="Template">
              <span className="text-brand-grey dark:text-slate-400">{preview.templateName} · fetched from Front just now</span>
            </Row>
          </dl>

          <div className="max-h-64 overflow-y-auto rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-[#0f2033]">
            {/* The real body, rendered as the recipient will see it. It comes from
                the team's own Front template, not from anything typed here. */}
            <div className="prose-sm text-[12.5px] text-brand-black dark:text-slate-200" dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      ) : null}

      {result ? <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{result}</p> : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={sending}>
          {result ? "Close" : "Cancel"}
        </Button>
        <Button onClick={doSend} disabled={sending || loading || !preview || Boolean(error)}>
          {sending ? "Sending…" : testMode ? "Send test" : "Send for real"}
        </Button>
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-brand-black dark:text-slate-200">{children}</dd>
    </div>
  );
}

// --- cc editor --------------------------------------------------------------

function CcEditor() {
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [customized, setCustomized] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/orientation/email-cc")
      .then((r) => r.json())
      .then((d: { addresses?: string[]; customized?: boolean }) => {
        setAddresses(d.addresses ?? []);
        setCustomized(Boolean(d.customized));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  async function save(next: string[]) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/orientation/email-cc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: next })
      });
      const d = (await res.json()) as { addresses?: string[]; dropped?: string[]; message?: string };
      if (!res.ok) throw new Error(d.message ?? "Couldn't save.");
      setAddresses(d.addresses ?? []);
      setCustomized(true);
      // Say what was thrown away — silently dropping a typo is how someone stops
      // being cc'd without ever finding out.
      setMsg(d.dropped?.length ? `Saved. Ignored (not a valid address): ${d.dropped.join(", ")}` : "Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const e = draft.trim();
    if (!e) return;
    setDraft("");
    void save([...addresses, e]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300"
      >
        Who gets cc&apos;d on these emails?
      </button>
    );
  }

  return (
    <div className="mt-3 rounded border border-brand-lea/15 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">Cc&apos;d on every orientation email</h3>
        <button onClick={() => setOpen(false)} className="text-[11px] font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
          Hide
        </button>
      </div>
      <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
        Applies to all orientation sessions, not just this one. The new hire&apos;s own supervisor is added separately, from their profile.
        {customized ? "" : " (Currently the original list from the Front template.)"}
      </p>

      {!loaded ? (
        <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {addresses.length === 0 ? (
              <span className="text-xs text-brand-grey dark:text-slate-400">Nobody is cc&apos;d.</span>
            ) : (
              addresses.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[11px] text-brand-lea dark:bg-white/5 dark:text-slate-200">
                  {a}
                  <button
                    onClick={() => void save(addresses.filter((x) => x !== a))}
                    disabled={busy}
                    aria-label={`Remove ${a}`}
                    className="text-red-600 transition hover:text-red-700 dark:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="name@skyshare.com"
              className="flex-1 rounded border border-brand-lea/15 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              onClick={add}
              disabled={busy || !draft.trim()}
              className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            >
              Add
            </button>
          </div>
          {msg ? <p className="mt-2 text-[11px] font-semibold text-brand-eden dark:text-slate-300">{msg}</p> : null}
        </>
      )}
    </div>
  );
}
