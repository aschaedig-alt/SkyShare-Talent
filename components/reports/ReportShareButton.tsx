"use client";

import { useState } from "react";
import { Share2, Copy, Check, Trash2, Loader, Plus } from "lucide-react";
import { Button, Modal } from "@/components/ui";

type ShareLink = { id: string; token: string; label: string | null; createdAt: string; revoked: boolean };

export function ReportShareButton() {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlFor = (token: string) => (typeof window === "undefined" ? "" : `${window.location.origin}/r/${token}`);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports-share");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { links: ShareLink[] };
      setLinks(data.links);
    } catch {
      setError("Couldn't load existing links.");
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setOpen(true);
    void load();
  }

  async function createLink() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/reports-share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { link: ShareLink };
      setLinks((cur) => [data.link, ...cur]);
      await copy(data.link);
    } catch {
      setError("Couldn't create a link.");
    } finally {
      setCreating(false);
    }
  }

  async function copy(link: ShareLink) {
    try {
      await navigator.clipboard.writeText(urlFor(link.token));
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((c) => (c === link.id ? null : c)), 1800);
    } catch {
      /* clipboard blocked — user can select the text manually */
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this link? Anyone using it will immediately lose access.")) return;
    setLinks((cur) => cur.filter((l) => l.id !== id));
    try {
      await fetch(`/api/reports-share?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      void load(); // resync on failure
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 print:hidden dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
      >
        <Share2 className="h-4 w-4" /> Share
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Share the Fleet Progression report</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Creates a link to this <span className="font-medium">live, read-only</span> report — the recipient can change the filters
          (active/all, tenure, year) but can&apos;t edit anything or reach the rest of the app. No login required.
        </p>
        <p className="mt-2 rounded border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          Anyone with the link can view it, and it includes employee names. Only share it where that&apos;s appropriate, and revoke it when you&apos;re done.
        </p>

        <div className="mt-4">
          <Button onClick={createLink} disabled={creating}>
            {creating ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creating ? "Creating…" : "Create a share link"}
          </Button>
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-300">{error}</p> : null}

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Active links</p>
          {loading ? (
            <p className="text-sm text-brand-grey dark:text-slate-400">Loading…</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-brand-grey dark:text-slate-400">No active links yet.</p>
          ) : (
            <ul className="space-y-2">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/20 px-2.5 py-2 dark:border-white/10 dark:bg-white/5">
                  <input
                    readOnly
                    value={urlFor(l.token)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate bg-transparent text-xs text-brand-lea outline-none dark:text-slate-200"
                  />
                  <button onClick={() => copy(l)} title="Copy link" className="shrink-0 rounded p-1.5 text-brand-grey transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-[#8fb3d6]">
                    {copiedId === l.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button onClick={() => revoke(l.id)} title="Revoke link" className="shrink-0 rounded p-1.5 text-brand-grey transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </Modal>
    </>
  );
}
