"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";

const FIELD = "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

export function NewCandidateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "", stage: "New", tags: "" });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.firstName.trim() && !form.lastName.trim()) {
      setError("Enter at least a first or last name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setOpen(false);
        setForm({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "", stage: "New", tags: "" });
        router.refresh();
      } else {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Could not create candidate.");
      }
    } catch {
      setError("Could not create candidate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-sweet dark:text-slate-100"
      >
        <UserPlus className="h-4 w-4" /> New candidate
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded bg-white p-5 shadow-xl dark:bg-brand-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">New candidate</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input className={FIELD} placeholder="First name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
                <input className={FIELD} placeholder="Last name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
              </div>
              <input className={FIELD} placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              <input className={FIELD} placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              <input className={FIELD} placeholder="Current title (optional)" value={form.currentTitle} onChange={(e) => set("currentTitle", e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className={FIELD} placeholder="Stage" value={form.stage} onChange={(e) => set("stage", e.target.value)} />
                <input className={FIELD} placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
              </div>
              {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">Cancel</button>
              <button onClick={submit} disabled={saving} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
                {saving ? "Saving…" : "Create candidate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
