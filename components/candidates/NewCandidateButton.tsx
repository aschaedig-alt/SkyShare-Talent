"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Link2 } from "lucide-react";
import { Button } from "@/components/ui";

const FIELD = "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

export function NewCandidateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the email/phone already belongs to someone, the API quietly opens that
  // existing record instead of making a duplicate. That used to happen with no
  // message at all — the recruiter couldn't tell a merge had occurred. Surface it.
  const [matched, setMatched] = useState<{ id: string; displayName: string } | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "", stage: "New", tags: "" });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setForm({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "", stage: "New", tags: "" });
    setMatched(null);
    setError(null);
  }

  function done() {
    setOpen(false);
    reset();
    router.refresh();
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
      const body = (await res.json().catch(() => ({}))) as { candidate?: { id: string; displayName: string }; reused?: boolean; message?: string };
      if (res.ok) {
        // Reused an existing record → tell them and hold the modal open so they
        // notice, with a link to the record. New record → close and refresh.
        if (body.reused && body.candidate) {
          setMatched(body.candidate);
        } else {
          done();
        }
      } else {
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
      <Button variant="gold" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> New candidate
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={done}>
          <div className="w-full max-w-md rounded bg-white p-5 shadow-xl dark:bg-brand-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{matched ? "Matched an existing candidate" : "New candidate"}</h2>
              <button onClick={done} className="rounded p-1 text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            {matched ? (
              <div>
                <div className="flex items-start gap-3 rounded border border-brand-gold/40 bg-brand-sweet/12 p-3 dark:bg-brand-gold/10">
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-eden dark:text-brand-sweet" />
                  <p className="text-sm text-brand-lea dark:text-slate-100">
                    Someone with that email or phone already exists, so we opened{" "}
                    <span className="font-semibold">{matched.displayName}</span> instead of creating a duplicate. Check it&apos;s the right person.
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="secondary" onClick={done}>Close</Button>
                  <Link
                    href={`/candidates/${matched.id}`}
                    className="inline-flex items-center rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden dark:bg-brand-sweet dark:text-brand-lea"
                  >
                    Open their record
                  </Link>
                </div>
              </div>
            ) : (
              <>
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
                  {error && <p className="text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="secondary" onClick={done}>Cancel</Button>
                  <Button onClick={submit} disabled={saving}>
                    {saving ? "Saving…" : "Create candidate"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
