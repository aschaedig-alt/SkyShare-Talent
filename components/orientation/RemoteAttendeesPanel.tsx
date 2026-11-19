"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import { loadRemoteKit, updateRemoteLinks, updateRemoteLunch } from "@/app/orientation/remote-actions";
// Type-only: remote-kit.ts reads the database, so a browser component may not
// import any VALUE from it.
import type { RemoteLink, RemoteLunch } from "@/lib/orientation/remote-kit";

const EMPTY_LUNCH: RemoteLunch = { address: "", order: "", ordered: false, arrival: "", notes: "" };

// Everything for the people joining by video, in one place on the session page.
//
//   LINKS — the standing video / presentation / anything-else list. The same for
//     every orientation (his answer, Nov 19 2026), so it is edited here once and
//     the "4. Remote prep" email fills it in on every send.
//   LUNCH — one card per remote attendee: delivery address, what to order,
//     ordered yes/no, when it lands in THEIR time zone. The room's lunch order
//     (vendor, arrival, confirmation) stays in the session's own lunch section.
//
// Cards rather than a table so it works on a phone without sideways scrolling.

const INPUT =
  "w-full rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-sm text-brand-black placeholder:text-brand-grey/70 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500";
const LABEL = "block text-[10.5px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400";

export type RemoteAttendee = {
  id: string;
  name: string;
  /** Whether "4. Remote prep" has gone to them (sent or ticked by hand). */
  prepSent: boolean;
};

export function RemoteAttendeesPanel({
  sessionId,
  attendees,
  meetLink
}: {
  sessionId: string;
  /** Only the attendees marked Remote. */
  attendees: RemoteAttendee[];
  meetLink: string | null;
}) {
  const [links, setLinks] = useState<RemoteLink[] | null>(null);
  const [lunches, setLunches] = useState<Record<string, RemoteLunch>>({});
  const [error, setError] = useState<string | null>(null);

  // Re-read when the remote set changes: marking somebody Remote should show
  // their card with whatever was saved for them before, not an empty one.
  const idsKey = attendees.map((a) => a.id).join(",");
  useEffect(() => {
    let live = true;
    loadRemoteKit(sessionId)
      .then((res) => {
        if (!live) return;
        if (!res.ok) setError(res.error ?? "Couldn't load.");
        setLinks(res.links ?? []);
        setLunches(res.lunches ?? {});
      })
      .catch(() => live && setError("Couldn't load the remote attendee details."));
    return () => {
      live = false;
    };
  }, [sessionId, idsKey]);

  const ordered = attendees.filter((a) => lunches[a.id]?.ordered).length;
  const prepped = attendees.filter((a) => a.prepSent).length;

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Remote attendees</h2>
        {attendees.length > 0 ? (
          <span className="text-[12px] text-brand-grey dark:text-slate-400">
            {attendees.length} joining by video · prep email {prepped}/{attendees.length} · lunch ordered {ordered}/{attendees.length}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        {attendees.length > 0 ? (
          <>
            Send them <b>4. Remote prep</b> from the email panel below — it carries these links, this session&apos;s Meet link,
            the joining best practices (camera on, muted when not speaking, distraction-free) and asks where to deliver lunch.
          </>
        ) : (
          <>
            Nobody on this session is marked <b>Remote</b>. Set an attendee&apos;s attendance to Remote in the list above and
            their lunch card appears here, and the <b>4. Remote prep</b> email becomes sendable for them.
          </>
        )}
      </p>
      {attendees.length > 0 && !meetLink ? (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
          This session has no Meet link saved. The remote email will point people at the link in their calendar invite instead —
          add one with &ldquo;Change time or place&rdquo; at the top to put it in the email.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[12px] text-red-700 dark:text-red-300">{error}</p> : null}

      <LinksEditor links={links} onSaved={setLinks} />

      {attendees.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-brand-lea dark:text-slate-100">Lunch delivery</h3>
          <p className="mt-0.5 text-[12px] text-brand-grey dark:text-slate-400">
            Ordered to each person&apos;s own address. Write the arrival time in <b>their</b> time zone.
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {attendees.map((a) => (
              <LunchCard
                key={a.id}
                attendee={a}
                lunch={lunches[a.id] ?? EMPTY_LUNCH}
                loading={links === null}
                onSaved={(l) => setLunches((cur) => ({ ...cur, [a.id]: l }))}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LinksEditor({ links, onSaved }: { links: RemoteLink[] | null; onSaved: (links: RemoteLink[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RemoteLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setDraft(links && links.length ? links.map((l) => ({ ...l })) : [{ label: "Orientation video", url: "" }, { label: "Orientation presentation", url: "" }]);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateRemoteLinks(draft.filter((l) => l.url.trim()));
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't save.");
      return;
    }
    const kept = res.links ?? [];
    const dropped = draft.filter((l) => l.url.trim()).length - kept.length;
    if (dropped > 0) {
      setError(`${dropped} link${dropped === 1 ? " wasn't" : "s weren't"} a valid web address and ${dropped === 1 ? "was" : "were"} not saved.`);
    }
    onSaved(kept);
    setEditing(false);
  }

  return (
    <div className="mt-3 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-brand-lea dark:text-slate-100">Links sent to remote attendees</h3>
          <p className="text-[11.5px] text-brand-grey dark:text-slate-400">The same for every orientation — change one here and every future email has it.</p>
        </div>
        {!editing ? (
          <Button variant="secondary" size="sm" onClick={start} disabled={links === null}>
            {links && links.length ? "Edit links" : "Add links"}
          </Button>
        ) : null}
      </div>

      {!editing ? (
        links === null ? (
          <p className="mt-2 text-[12px] text-brand-grey dark:text-slate-400">Loading…</p>
        ) : links.length === 0 ? (
          <p className="mt-2 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
            No links saved yet — the remote email will go out without the video or presentation until you add them.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {links.map((l, i) => (
              <li key={i} className="min-w-0 text-[12.5px]">
                <span className="font-semibold text-brand-lea dark:text-slate-100">{l.label}</span>{" "}
                <a href={l.url} target="_blank" rel="noreferrer" className="break-all text-brand-eden underline dark:text-brand-sweet">
                  {l.url}
                </a>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="mt-2 space-y-2">
          {draft.map((l, i) => (
            <div key={i} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center">
              <input
                value={l.label}
                onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                placeholder="What it is (e.g. Orientation video)"
                aria-label="Link name"
                className={INPUT}
              />
              <input
                value={l.url}
                onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                placeholder="https://…"
                aria-label="Link address"
                inputMode="url"
                className={INPUT}
              />
              <Button variant="ghost" size="sm" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setDraft((d) => [...d, { label: "", url: "" }])}>
              + Add a link
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save links"}
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="mt-2 text-[12px] text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}

function LunchCard({
  attendee,
  lunch,
  loading,
  onSaved
}: {
  attendee: RemoteAttendee;
  lunch: RemoteLunch;
  loading: boolean;
  onSaved: (lunch: RemoteLunch) => void;
}) {
  const [form, setForm] = useState<RemoteLunch>(lunch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-seed when the saved value arrives (first load) — but not on every
  // parent render, or typing would be overwritten.
  const savedKey = lunch.updatedAt ?? "";
  useEffect(() => {
    setForm(lunch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, loading]);

  const dirty =
    form.address !== lunch.address ||
    form.order !== lunch.order ||
    form.ordered !== lunch.ordered ||
    form.arrival !== lunch.arrival ||
    form.notes !== lunch.notes;

  async function save(next: RemoteLunch = form) {
    setSaving(true);
    setError(null);
    const res = await updateRemoteLunch(attendee.id, next);
    setSaving(false);
    if (!res.ok || !res.lunch) {
      setError(res.error ?? "Couldn't save.");
      return;
    }
    onSaved(res.lunch);
  }

  return (
    <div
      className={clsx(
        "rounded border p-3",
        lunch.ordered
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
          : "border-brand-lea/15 dark:border-white/10"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-brand-lea dark:text-slate-100">{attendee.name}</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-brand-lea dark:text-slate-100">
          <input
            type="checkbox"
            checked={form.ordered}
            disabled={loading || saving}
            onChange={(e) => {
              // The tick saves on its own — it is the one field people come back
              // just to flip, and an unsaved tick would be a false "ordered".
              const next = { ...form, ordered: e.target.checked };
              setForm(next);
              void save(next);
            }}
          />
          Lunch ordered
        </label>
      </div>
      {!attendee.prepSent ? (
        <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">Remote prep email not sent yet — it asks them for the address and their order.</p>
      ) : null}
      <div className="mt-2 space-y-2">
        <div>
          <label className={LABEL} htmlFor={`addr-${attendee.id}`}>Deliver to</label>
          <textarea
            id={`addr-${attendee.id}`}
            rows={2}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Street, city, state"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor={`order-${attendee.id}`}>Order</label>
          <input
            id={`order-${attendee.id}`}
            value={form.order}
            onChange={(e) => setForm({ ...form, order: e.target.value })}
            placeholder="What, and from where (DoorDash, Uber Eats…)"
            className={INPUT}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor={`arr-${attendee.id}`}>Arrives (their time)</label>
            <input
              id={`arr-${attendee.id}`}
              value={form.arrival}
              onChange={(e) => setForm({ ...form, arrival: e.target.value })}
              placeholder="e.g. 11:45am PT"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor={`notes-${attendee.id}`}>Notes</label>
            <input
              id={`notes-${attendee.id}`}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Allergies, gate code…"
              className={INPUT}
            />
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {error ? <span className="mr-auto text-[12px] text-red-700 dark:text-red-300">{error}</span> : null}
        {dirty ? <span className="text-[11px] text-amber-800 dark:text-amber-300">Unsaved</span> : lunch.updatedAt ? <span className="text-[11px] text-brand-grey dark:text-slate-400">Saved</span> : null}
        <Button size="sm" variant="secondary" onClick={() => void save()} disabled={!dirty || saving || loading}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
