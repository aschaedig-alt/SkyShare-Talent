"use client";

import { useEffect, useState } from "react";
import { CreditCard, Copy, Check, Plus, Pencil, Trash2 } from "lucide-react";
import { Modal, Input, Button } from "@/components/ui";
import { buildBusinessCard, buildVariantCard, formatCardText, type BusinessCardInput, type BusinessCard } from "@/lib/business-cards/card";
import { BusinessCardVisual } from "@/components/business-cards/BusinessCardVisual";

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
        {label ? <span className="rounded-full bg-brand-lea/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-lea dark:bg-white/10 dark:text-slate-200">{label}</span> : null}
        <div className="ml-auto flex items-center gap-0.5">
          {onEdit ? (
            <button onClick={onEdit} title="Edit card" className="rounded p-1 text-brand-grey/70 transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-500 dark:hover:bg-white/10">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <button onClick={onDelete} title="Delete card" className="rounded p-1 text-brand-grey/70 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/15">
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
  ssEmail
}: {
  hireId: string;
  name: string;
  position: string | null;
  phone: string | null;
  ssEmail: string | null;
}) {
  const input: BusinessCardInput = { name, position, phone, ssEmail };
  const primary = buildBusinessCard(input);

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
    try {
      await navigator.clipboard.writeText(formatCardText(card));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
    } catch {
      /* clipboard blocked */
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
        <button onClick={openAdd} title="Add another card" className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <CardBlock label={variants.length ? "Primary" : null} card={primary} copied={copiedKey === "primary"} onCopy={() => copyCard("primary", primary)} />
        {variants.map((v) => {
          const card = buildVariantCard(input, v);
          return <CardBlock key={v.id} label={v.label} card={card} copied={copiedKey === v.id} onCopy={() => copyCard(v.id, card)} onEdit={() => openEdit(v)} onDelete={() => remove(v.id)} />;
        })}
      </div>

      <Modal open={modal !== null} onClose={() => setModal(null)} busy={busy}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{modal?.mode === "add" ? "Add a card" : "Edit card"}</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">A second card for {name} — e.g. a recruiting card with its own phone and email. Leave a field blank to reuse the primary card&apos;s value.</p>
        <div className="mt-4 space-y-3">
          {field("Label", "label", "Recruiting")}
          {field("Title", "title", primary.title || "Same as profile")}
          <div className="flex gap-3">
            <div className="w-1/2">{field("Mobile", "mobile", primary.mobile || "Same as profile")}</div>
            <div className="w-1/2">{field("SkyOps #", "skyops", primary.skyops)}</div>
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
