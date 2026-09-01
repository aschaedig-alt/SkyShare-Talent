"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, ExternalLink, Inbox, Mail, Plane, Sparkles } from "lucide-react";
import { Badge, Button, Input, Modal, Textarea } from "@/components/ui";
import { EVENT_TYPES } from "@/lib/events/constants";
import { formatMixedDay } from "@/lib/dates/display";

/**
 * Turning an email into a pending event.
 *
 * The shape of this follows how the invitations actually arrive: sometimes you
 * want the app to go and look ("what's sitting in the inbox?"), sometimes you
 * already have the one email in hand and just want it filed. So there are two
 * ways in, and they converge on the same review step.
 *
 * The review step is the point. Nothing is written until you have seen every
 * field and can fix it — extraction is good but it is a reading of prose, and a
 * wrong date on a career fair costs the fair. Each imported event lands as
 * PENDING so importing is never the same as committing to go.
 */

const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400";

type Draft = {
  name: string | null;
  type: string;
  startsAt: string | null;
  endsAt: string | null;
  timeOfDay: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  shipToAddress: string | null;
  aircraftMentioned: boolean;
  notes: string | null;
  source: "ai" | "pattern";
};

type PossibleDuplicate = {
  id: string;
  name: string;
  startsAt: string;
  status: string;
  matchedOn: string;
};

type Lead = {
  conversationId: string | null;
  frontUrl: string | null;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  receivedAt: string | null;
  draft: Draft;
  possibleDuplicate?: PossibleDuplicate | null;
};

type ScanResult = {
  leads: Lead[];
  scanned: number;
  alreadyImported: number;
  skipped: number;
  pastEvents: number;
  truncated: boolean;
  degraded: boolean;
};

/** An ISO instant -> the yyyy-mm-dd a <input type="date"> needs, in local time. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Event dates are a mixed column — see formatMixedDay. The value here is the
// date the extractor read out of the email, so it can be either kind.
function fmtDay(iso: string | null) {
  return iso ? formatMixedDay(iso) : "no date";
}

export function EventFromEmailModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  const [tab, setTab] = useState<"scan" | "paste">("scan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [scan, setScan] = useState<ScanResult | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [frontLink, setFrontLink] = useState("");

  // The lead being reviewed, plus the editable copy of its fields.
  const [reviewing, setReviewing] = useState<Lead | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [aircraftMentioned, setAircraftMentioned] = useState(false);

  function reset() {
    setScan(null);
    setReviewing(null);
    setError(null);
    setNotice(null);
    setPasteText("");
    setPasteSubject("");
    setFrontLink("");
  }

  function closeAll() {
    reset();
    onClose();
  }

  function beginReview(lead: Lead) {
    const d = lead.draft;
    setReviewing(lead);
    setAircraftMentioned(d.aircraftMentioned);
    setForm({
      name: d.name ?? "",
      type: d.type ?? "CAREER_FAIR",
      startsAt: toDateInput(d.startsAt),
      endsAt: toDateInput(d.endsAt),
      venue: d.venue ?? "",
      city: d.city ?? "",
      state: d.state ?? "",
      website: d.website ?? "",
      contactName: d.contactName ?? "",
      contactEmail: d.contactEmail ?? "",
      contactPhone: d.contactPhone ?? "",
      shipToAddress: d.shipToAddress ?? "",
      notes: [d.timeOfDay ? `Hours: ${d.timeOfDay}` : null, d.notes].filter(Boolean).join("\n")
    });
    setError(null);
  }

  async function runScan() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/events/leads");
      const payload = (await res.json()) as ScanResult & { message?: string };
      if (!res.ok) throw new Error(payload.message ?? "Could not read the mailbox.");
      setScan(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the mailbox.");
    } finally {
      setBusy(false);
    }
  }

  async function readOne(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/events/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await res.json()) as { lead?: Lead; message?: string };
      if (!res.ok || !payload.lead) throw new Error(payload.message ?? "Could not read that email.");
      beginReview(payload.lead);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that email.");
    } finally {
      setBusy(false);
    }
  }

  async function addEvent() {
    if (!reviewing) return;
    if (!form.startsAt) {
      setError("Pick a start date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/events/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: { ...form, aircraftMentioned },
          source: reviewing.conversationId
            ? {
                conversationId: reviewing.conversationId,
                frontUrl: reviewing.frontUrl,
                subject: reviewing.subject
              }
            : null
        })
      });
      const payload = (await res.json()) as { id?: string; message?: string };
      if (!res.ok || !payload.id) throw new Error(payload.message ?? "Unable to add that event.");
      closeAll();
      router.push(`/events/${payload.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add that event.");
      setBusy(false);
    }
  }

  async function skipLead(lead: Lead) {
    if (!lead.conversationId) return;
    setBusy(true);
    try {
      await fetch("/api/events/leads/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: lead.conversationId, subject: lead.subject })
      });
      setScan((cur) =>
        cur
          ? { ...cur, leads: cur.leads.filter((l) => l.conversationId !== lead.conversationId), skipped: cur.skipped + 1 }
          : cur
      );
      setNotice("Skipped. It won't come up again — you can undo that from Skipped emails.");
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- review
  if (open && reviewing) {
    const d = reviewing.draft;
    return (
      <Modal open onClose={closeAll} busy={busy} maxWidth="max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Add this event?</h2>
            <p className="mt-1 truncate text-xs text-brand-grey dark:text-slate-400">
              From “{reviewing.subject}”
              {reviewing.fromEmail ? ` · ${reviewing.fromEmail}` : ""}
            </p>
          </div>
          <Badge tone={d.source === "ai" ? "info" : "neutral"}>
            {d.source === "ai" ? "Read by Claude" : "Pattern-matched"}
          </Badge>
        </div>

        <p className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 text-xs text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          Everything below was read out of the email — check it before adding. It goes on the calendar as{" "}
          <span className="font-semibold text-brand-lea dark:text-slate-200">Pending decision</span>, so adding it does
          not mean we are going.
        </p>

        {reviewing.possibleDuplicate ? (
          <p className="mt-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This may already be on the calendar as{" "}
              <a
                href={`/events/${reviewing.possibleDuplicate.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
              >
                {reviewing.possibleDuplicate.name}
              </a>{" "}
              ({reviewing.possibleDuplicate.matchedOn}). Adding it again will create a second event.
            </span>
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL}>Event name</span>
            <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block">
            <span className={LABEL}>Type</span>
            <select
              className={`mt-1 ${FIELD}`}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Starts</span>
              <Input
                className="mt-1"
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Ends</span>
              <Input
                className="mt-1"
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </label>
          </div>
          <label className="block sm:col-span-2">
            <span className={LABEL}>Venue</span>
            <Input className="mt-1" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </label>
          <label className="block">
            <span className={LABEL}>City</span>
            <Input className="mt-1" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label className="block">
            <span className={LABEL}>State</span>
            <Input className="mt-1" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL}>Event page</span>
            <Input
              className="mt-1"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </label>

          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={LABEL}>Organizer</span>
              <Input
                className="mt-1"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Their email</span>
              <Input
                className="mt-1"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Their phone</span>
              <Input
                className="mt-1"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              />
            </label>
          </div>

          <label className="block sm:col-span-2">
            <span className={LABEL}>Ship materials to</span>
            <Textarea
              className="mt-1"
              rows={3}
              value={form.shipToAddress}
              onChange={(e) => setForm({ ...form, shipToAddress: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL}>Notes</span>
            <Textarea
              className="mt-1"
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          <label className="flex items-start gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 px-3 py-2 sm:col-span-2 dark:border-white/10 dark:bg-white/5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={aircraftMentioned}
              onChange={(e) => setAircraftMentioned(e.target.checked)}
            />
            <span className="text-xs text-brand-grey dark:text-slate-400">
              <span className="inline-flex items-center gap-1 font-semibold text-brand-lea dark:text-slate-200">
                <Plane className="h-3 w-3" /> The email mentions a static display / aircraft
              </span>
              <br />
              Flags the aircraft question on the event. It stays <em>Not decided</em> either way — this only makes sure
              nobody forgets to answer it.
            </span>
          </label>
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {reviewing.frontUrl ? (
              <a
                href={reviewing.frontUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-200"
              >
                Read the email <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setReviewing(null)} disabled={busy}>
              Back
            </Button>
            <Button onClick={addEvent} disabled={busy || !form.startsAt}>
              {busy ? "Adding…" : "Add as pending"}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ------------------------------------------------------------ scan / paste
  return (
    <Modal open={open} onClose={closeAll} busy={busy} maxWidth="max-w-2xl">
      <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Add an event from an email</h2>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        Events arrive as mail from the organizer. Let me go and find them, or hand me one directly.
      </p>

      <div className="mt-4 border-b border-brand-lea/10 dark:border-white/10">
        <nav className="flex gap-6">
          {([
            ["scan", "Check the inbox", Inbox],
            ["paste", "Give me one", Mail]
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setError(null);
              }}
              className={clsx(
                "flex items-center gap-1.5 border-b-2 px-1 py-2 text-sm font-semibold transition",
                tab === key
                  ? "border-brand-lea text-brand-lea dark:border-brand-gold dark:text-slate-100"
                  : "border-transparent text-brand-grey hover:text-brand-lea dark:text-slate-400"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "scan" ? (
        <div className="mt-4 space-y-3">
          {!scan ? (
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-4 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
              <p>
                I&apos;ll read the recruiting mailbox for invitations to career fairs, school visits, conferences and
                airshows, and show you what I find. Nothing is added until you say so.
              </p>
              <p className="mt-2 text-xs">
                Emails you&apos;ve already added, or already passed on, are left out.
              </p>
              <Button className="mt-3" onClick={runScan} disabled={busy}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {busy ? "Reading the inbox…" : "Check the inbox"}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-brand-grey dark:text-slate-400">
                <span>
                  Read {scan.scanned} thread{scan.scanned === 1 ? "" : "s"} · found{" "}
                  <span className="font-semibold text-brand-lea dark:text-slate-200">{scan.leads.length}</span>
                </span>
                {scan.alreadyImported > 0 ? <span>· {scan.alreadyImported} already added</span> : null}
                {scan.skipped > 0 ? <span>· {scan.skipped} previously skipped</span> : null}
                {scan.pastEvents > 0 ? <span>· {scan.pastEvents} already happened</span> : null}
                <button onClick={runScan} disabled={busy} className="ml-auto font-semibold text-brand-eden hover:underline dark:text-brand-sweet">
                  Check again
                </button>
              </div>

              {scan.truncated ? (
                <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                  There were more candidates than I read in one pass. Deal with these, then check again.
                </p>
              ) : null}
              {scan.degraded ? (
                <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                  Couldn&apos;t reach Claude for at least one of these, so it fell back to pattern-matching and the
                  details are rougher than usual — check the venue and links especially. Worth trying again in a
                  moment.
                </p>
              ) : null}
              {notice ? (
                <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 text-xs text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  {notice}
                </p>
              ) : null}

              {scan.leads.length === 0 ? (
                <p className="rounded border border-brand-lea/10 p-4 text-center text-sm text-brand-grey dark:border-white/10 dark:text-slate-400">
                  Nothing new waiting. Everything the mailbox holds is either already on the calendar, skipped, or has
                  already happened.
                </p>
              ) : (
                <ul className="space-y-2">
                  {scan.leads.map((lead) => (
                    <li
                      key={lead.conversationId ?? lead.subject}
                      className="rounded border border-brand-lea/10 bg-white p-3 shadow-panel dark:border-white/10 dark:bg-brand-panel"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
                            {lead.draft.name ?? lead.subject}
                          </p>
                          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                            {fmtDay(lead.draft.startsAt)}
                            {lead.draft.endsAt ? ` – ${fmtDay(lead.draft.endsAt)}` : ""}
                            {lead.draft.city ? ` · ${lead.draft.city}${lead.draft.state ? `, ${lead.draft.state}` : ""}` : ""}
                          </p>
                          {lead.draft.venue ? (
                            <p className="mt-0.5 truncate text-xs text-brand-grey dark:text-slate-500">{lead.draft.venue}</p>
                          ) : null}
                          {lead.draft.aircraftMentioned ? (
                            <p className="mt-1 inline-flex items-center gap-1 rounded bg-brand-gold/20 px-1.5 py-0.5 text-[11px] font-semibold text-brand-lea dark:text-brand-gold">
                              <Plane className="h-3 w-3" /> mentions a static display
                            </p>
                          ) : null}
                          {lead.possibleDuplicate ? (
                            <p className="mt-1.5 flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              <span>
                                Possibly already on the calendar as{" "}
                                <a
                                  href={`/events/${lead.possibleDuplicate.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold underline"
                                >
                                  {lead.possibleDuplicate.name}
                                </a>{" "}
                                — {lead.possibleDuplicate.matchedOn}. Check before adding.
                              </span>
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" onClick={() => beginReview(lead)} disabled={busy}>
                            Review
                          </Button>
                          <button
                            onClick={() => skipLead(lead)}
                            disabled={busy}
                            className="text-xs font-semibold text-brand-grey hover:text-red-600 dark:text-slate-400"
                          >
                            Not this one
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className={LABEL}>Front link</span>
            <div className="mt-1 flex gap-2">
              <Input
                value={frontLink}
                onChange={(e) => setFrontLink(e.target.value)}
                placeholder="https://app.frontapp.com/open/cnv_…"
              />
              <Button onClick={() => readOne({ conversation: frontLink })} disabled={busy || !frontLink.trim()}>
                Read
              </Button>
            </div>
          </label>

          <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-brand-grey dark:text-slate-500">
            <span className="h-px flex-1 bg-brand-lea/10 dark:bg-white/10" />
            or paste it
            <span className="h-px flex-1 bg-brand-lea/10 dark:bg-white/10" />
          </div>

          <label className="block">
            <span className={LABEL}>Subject</span>
            <Input
              className="mt-1"
              value={pasteSubject}
              onChange={(e) => setPasteSubject(e.target.value)}
              placeholder="UVU Aviation Career Fair"
            />
          </label>
          <label className="block">
            <span className={LABEL}>The email</span>
            <Textarea
              className="mt-1"
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the whole email here — dates, venue, contact, shipping instructions and all."
            />
          </label>
          <Button
            onClick={() => readOne({ text: pasteText, subject: pasteSubject })}
            disabled={busy || !pasteText.trim()}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            {busy ? "Reading…" : "Read this email"}
          </Button>
        </div>
      )}

      {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={closeAll} disabled={busy}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
