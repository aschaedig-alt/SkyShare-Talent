"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Modal } from "@/components/ui";

/**
 * Add a pilot requirement without going through an import.
 *
 * Roles come from the fleet position registry rather than a free-text box, so a
 * new requirement lands on a real canonical role — that's what keeps one
 * requirement per seat instead of the duplicate pile this page used to hold.
 * Roles that already have a requirement are shown but not selectable.
 */

type Position = {
  slug: string;
  title: string;
  aircraft: string;
  seat: string;
  typeRating: string;
  alreadyExists: boolean;
};

export function NewRequirementButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || positions) return;
    fetch("/api/pilot-requirements")
      .then((r) => r.json())
      .then((d) => setPositions(d.positions ?? []))
      .catch(() => setError("Could not load the fleet positions."));
  }, [open, positions]);

  async function create() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetPositionSlug: selected })
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; message?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.message ?? "Could not create the requirement.");
      setOpen(false);
      setSelected("");
      // Land on the new one so its gates can be filled in straight away.
      router.push(`/pilot-requirements?id=${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the requirement.");
    } finally {
      setSaving(false);
    }
  }

  const available = positions?.filter((p) => !p.alreadyExists) ?? [];

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New requirement
      </Button>

      <Modal open={open} onClose={() => !saving && setOpen(false)} busy={saving} maxWidth="max-w-lg">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">New pilot requirement</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Pick the fleet position. The standard requirement gates are added automatically so you can start setting
          minimums right away.
        </p>

        {!positions ? (
          <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Loading fleet positions…</p>
        ) : (
          <>
            <div className="mt-4 max-h-72 overflow-auto rounded border border-brand-lea/10 dark:border-white/10">
              {available.length === 0 ? (
                <p className="p-3 text-sm text-brand-grey dark:text-slate-400">
                  Every active fleet position already has a requirement.
                </p>
              ) : (
                available.map((p) => (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => setSelected(p.slug)}
                    className={`flex w-full items-center justify-between border-b border-brand-lea/10 px-3 py-2 text-left text-sm transition last:border-0 hover:bg-brand-gold/10 dark:border-white/10 ${
                      selected === p.slug ? "bg-brand-lea text-white dark:bg-brand-sweet dark:text-brand-lea" : "text-brand-lea dark:text-slate-100"
                    }`}
                  >
                    <span className="font-medium">{p.title}</span>
                    <span className={`text-xs ${selected === p.slug ? "opacity-80" : "text-brand-grey dark:text-slate-400"}`}>
                      {p.aircraft} · {p.seat}
                      {p.typeRating ? ` · ${p.typeRating}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
            {positions.some((p) => p.alreadyExists) && (
              <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">
                {positions.filter((p) => p.alreadyExists).length} position(s) hidden — they already have a requirement.
              </p>
            )}
          </>
        )}

        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={create} disabled={saving || !selected}>
            {saving ? "Creating…" : "Create requirement"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
