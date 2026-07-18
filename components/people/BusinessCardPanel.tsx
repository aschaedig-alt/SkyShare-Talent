"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { CreditCard, Copy, Check, Plus, Pencil, Trash2, AlertTriangle, ExternalLink } from "lucide-react";
import { Modal, Input, Button } from "@/components/ui";
import {
  buildBusinessCard,
  buildVariantCard,
  formatCardText,
  formatCardHtml,
  defaultCardTitle,
  cardOrderState,
  CARD_STATUSES,
  CARD_STATUS_LABEL,
  type BusinessCardInput,
  type BusinessCard
} from "@/lib/business-cards/card";
import { copyRich } from "@/lib/business-cards/copy";
import { BusinessCardVisual } from "@/components/business-cards/BusinessCardVisual";

function fmtDay(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "";
}

type Variant = { id: string; label: string; title: string | null; skyops: string | null; mobile: string | null; email: string | null; web: string | null };
type Form = { label: string; title: string; mobile: string; email: string; web: string; skyops: string };
const EMPTY: Form = { label: "", title: "", mobile: "", email: "", web: "", skyops: "" };

function CardBlock({
  label,
  card,
  copied,
  onCopy,
  onEdit,
  onDelete
}: {
  label: string | null;
  card: BusinessCard;
  copied: boolean;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="border-t border-brand-lea/10 pt-3 first:border-t-0 first:pt-0 dark:border-white/10">
      <div className="mb-2 flex items-center gap-1.5">
        {label ? <span className="rounded bg-brand-lea/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-lea dark:bg-white/10 dark:text-slate-200">{label}</span> : null}
        <div className="ml-auto flex items-center gap-0.5">
          {onEdit ? (
            <button onClick={onEdit} title="Edit card" className="rounded p-1 text-brand-grey/70 transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-500 dark:hover:bg-white/10">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <button onClick={onDelete} title="Delete card" className="rounded p-1 text-brand-grey/70 transition hover:bg-red-50 hover:text-red-600 dark:hover:text-red-300 dark:text-slate-500 dark:hover:bg-red-500/15">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button onClick={onCopy} title="Copy for printer" className="rounded p-1 text-brand-grey/70 transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-500 dark:hover:bg-white/10">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <BusinessCardVisual card={card} />
    </div>
  );
}

export function BusinessCardPanel({
  hireId,
  name,
  position,
  phone,
  ssEmail,
  status: statusProp,
  cardTitle: cardTitleProp,
  orientationDate
}: {
  hireId: string;
  name: string;
  position: string | null;
  phone: string | null;
  ssEmail: string | null;
  status: string;
  cardTitle: string | null;
  orientationDate: string | null;
}) {
  const [cardTitle, setCardTitle] = useState<string | null>(cardTitleProp);
  const input: BusinessCardInput = { name, position, phone, ssEmail, cardTitle };
  const primary = buildBusinessCard(input);

  const [status, setStatus] = useState(statusProp);
  const [titleModal, setTitleModal] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const order = cardOrderState(orientationDate, status, Date.now());

  const [variants, setVariants] = useState<Variant[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "add" | "edit"; id?: string } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/new-hires/${hireId}/cards`);
      if (res.ok) setVariants(((await res.json()) as { variants: Variant[] }).variants);
    } catch {
      /* leave as-is */
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hireId]);

  async function copyCard(key: string, card: BusinessCard) {
    if (await copyRich(formatCardText(card), formatCardHtml(card))) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
    }
  }

  function openTitle() {
    setTitleDraft(cardTitle ?? "");
    setTitleModal(true);
  }
  async function saveTitle() {
    const next = titleDraft.trim() || null;
    const prev = cardTitle;
    setCardTitle(next);
    setTitleModal(false);
    try {
      const res = await fetch(`/api/new-hires/${hireId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessCardTitle: next }) });
      if (!res.ok) setCardTitle(prev);
    } catch {
      setCardTitle(prev);
    }
  }

  function openAdd() {
    setForm(EMPTY);
    setErr(null);
    setModal({ mode: "add" });
  }
  function openEdit(v: Variant) {
    setForm({ label: v.label, title: v.title ?? "", mobile: v.mobile ?? "", email: v.email ?? "", web: v.web ?? "", skyops: v.skyops ?? "" });
    setErr(null);
    setModal({ mode: "edit", id: v.id });
  }

  async function save() {
    if (!form.label.trim()) {
      setErr('Give the card a label, e.g. "Recruiting".');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const url = modal?.mode === "add" ? `/api/new-hires/${hireId}/cards` : `/api/new-hires/${hireId}/cards/${modal?.id}`;
      const res = await fetch(url, { method: modal?.mode === "add" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? "Couldn't save the card.");
      setModal(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the card.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this secondary card?")) return;
    setVariants((v) => v.filter((x) => x.id !== id));
    try {
      await fetch(`/api/new-hires/${hireId}/cards/${id}`, { method: "DELETE" });
    } catch {
      void load();
    }
  }

  async function saveStatus(next: string) {
    const prev = status;
    setStatus(next);
    try {
      const res = await fetch(`/api/new-hires/${hireId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessCardStatus: next }) });
      if (!res.ok) setStatus(prev);
    } catch {
      setStatus(prev);
    }
  }

  const field = (label: string, key: keyof Form, placeholder: string) => (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">{label}</span>
      <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} className="mt-1" />
    </label>
  );

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-brand-lea dark:text-slate-100">
          <CreditCard className="h-4 w-4" /> Business card{variants.length ? "s" : ""}
        </h2>
        <div className="flex items-center gap-2">
          {/* Jump to the bulk order page (order everyone's cards for the printer). */}
          <Link
            href="/business-cards"
            title="Open the Business cards page to order in bulk"
            className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Order
          </Link>
          <button onClick={openAdd} title="Add another card" className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Order status + orientation deadline */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => saveStatus(e.target.value)}
          className={clsx(
            "rounded border px-2 py-1 text-xs font-semibold outline-none transition",
            status === "RECEIVED"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
              : status === "ORDERED"
                ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300"
                : status === "NOT_NEEDED"
                  ? "border-brand-lea/20 bg-brand-cloudDancer/40 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
                  : "border-brand-gold/50 bg-brand-gold/15 text-brand-lea dark:text-brand-gold"
          )}
        >
          {CARD_STATUSES.map((s) => (
            <option key={s} value={s}>{CARD_STATUS_LABEL[s]}</option>
          ))}
        </select>
        {status === "NEEDED" && order.orderByISO ? (
          <span className={clsx("inline-flex items-center gap-1 text-xs font-medium", order.overdue ? "text-red-600 dark:text-red-400" : order.needsAction ? "text-amber-600 dark:text-amber-400" : "text-brand-grey dark:text-slate-400")}>
            {order.overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
            {order.overdue ? `Order now — orientation ${fmtDay(orientationDate)}` : `Order by ${fmtDay(order.orderByISO)} for orientation ${fmtDay(orientationDate)}`}
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        <CardBlock label={variants.length ? "Primary" : null} card={primary} copied={copiedKey === "primary"} onCopy={() => copyCard("primary", primary)} onEdit={openTitle} />
        {variants.map((v) => {
          const card = buildVariantCard(input, v);
          return <CardBlock key={v.id} label={v.label} card={card} copied={copiedKey === v.id} onCopy={() => copyCard(v.id, card)} onEdit={() => openEdit(v)} onDelete={() => remove(v.id)} />;
        })}
      </div>

      <Modal open={titleModal} onClose={() => setTitleModal(false)}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Card title</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          The title printed on {name}&apos;s card — separate from their profile position, so you can shorten or reword it without ever touching their real role. Pilots default to <strong>Pilot</strong> (they change aircraft); leave blank to use the default.
        </p>
        <label className="mt-4 block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">Title</span>
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} placeholder={defaultCardTitle(position) || "e.g. Pilot"} className="mt-1" autoFocus />
        </label>
        <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-500">Default: {defaultCardTitle(position) || "—"}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setTitleModal(false)}>Cancel</Button>
          <Button onClick={saveTitle}>Save</Button>
        </div>
      </Modal>

      <Modal open={modal !== null} onClose={() => setModal(null)} busy={busy}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{modal?.mode === "add" ? "Add a card" : "Edit card"}</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">A second card for {name} — e.g. a recruiting card with its own phone and email. Leave a field blank to reuse the primary card&apos;s value.</p>
        <div className="mt-4 space-y-3">
          {field("Label", "label", "Recruiting")}
          {field("Title", "title", primary.title || "Same as profile")}
          <div className="flex gap-3">
            <div className="w-1/2">{field("Mobile", "mobile", primary.mobile || "Same as profile")}</div>
            <div className="w-1/2">{field(primary.isFlightCrew ? "SkyOps #" : "Phone #", "skyops", primary.skyops)}</div>
          </div>
          {field("Email", "email", primary.email || "Same as profile")}
          {field("Web", "web", primary.web)}
          {err ? <p className="text-sm font-medium text-red-700 dark:text-red-300">{err}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModal(null)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : modal?.mode === "add" ? "Add card" : "Save"}</Button>
        </div>
      </Modal>
    </section>
  );
}
