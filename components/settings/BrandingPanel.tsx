"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BRANDING_SLOTS, type WorkspaceBranding } from "@/lib/branding/shared";

type BrandingPanelProps = {
  initialBranding: WorkspaceBranding;
};

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_FILE_BYTES = 650 * 1024;
const MAX_LOGOS = 12;

function newId(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `logo_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function BrandingPanel({ initialBranding }: BrandingPanelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [branding, setBranding] = useState<WorkspaceBranding>(initialBranding);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialBranding));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = useMemo(() => JSON.stringify(branding) !== savedSnapshot, [branding, savedSnapshot]);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setStatus(null);
    const files = Array.from(event.target.files ?? []);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (!files.length) {
      return;
    }
    if (branding.logos.length + files.length > MAX_LOGOS) {
      setError(`You can store up to ${MAX_LOGOS} logos.`);
      return;
    }

    const added: WorkspaceBranding["logos"] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`"${file.name}" must be a PNG, JPG, WEBP, GIF, or SVG.`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" is ${Math.round(file.size / 1024)} KB. Keep each under ${Math.round(MAX_FILE_BYTES / 1024)} KB.`);
        return;
      }
      try {
        const dataUrl = await readFile(file);
        const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Logo";
        added.push({ id: newId(), name: baseName, dataUrl });
      } catch {
        setError(`Could not read "${file.name}".`);
        return;
      }
    }
    setBranding((current) => ({ ...current, logos: [...current.logos, ...added] }));
  }

  function renameLogo(id: string, name: string) {
    setBranding((current) => ({
      ...current,
      logos: current.logos.map((logo) => (logo.id === id ? { ...logo, name: name.slice(0, 60) } : logo))
    }));
  }

  function deleteLogo(id: string) {
    setBranding((current) => {
      const assignments = { ...current.assignments };
      for (const slot of BRANDING_SLOTS) {
        if (assignments[slot.key] === id) {
          assignments[slot.key] = null;
        }
      }
      return { logos: current.logos.filter((logo) => logo.id !== id), assignments };
    });
  }

  function assignSlot(slotKey: (typeof BRANDING_SLOTS)[number]["key"], logoId: string) {
    setBranding((current) => ({
      ...current,
      assignments: { ...current.assignments, [slotKey]: logoId || null }
    }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/workspace-settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding)
      });
      const payload = (await response.json().catch(() => null)) as (WorkspaceBranding & { message?: string }) | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "Unable to save branding.");
      }
      const normalized: WorkspaceBranding = { logos: payload.logos, assignments: payload.assignments };
      setBranding(normalized);
      setSavedSnapshot(JSON.stringify(normalized));
      setStatus("Branding saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save branding.");
    } finally {
      setBusy(false);
    }
  }

  function dataUrlFor(id: string | null) {
    return id ? branding.logos.find((logo) => logo.id === id)?.dataUrl ?? null : null;
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Branding</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Logos</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-grey dark:text-slate-400">
            Upload a library of logos, then assign one to each placement. Square, transparent PNG or SVG works best.
            Max ~650&nbsp;KB each, up to {MAX_LOGOS} logos.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving..." : dirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
      {status ? <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">{status}</p> : null}

      {/* Library */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Logo library</h3>
          <label className="cursor-pointer rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
            + Add logo
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_TYPES.join(",")}
              multiple
              onChange={onPick}
              disabled={busy}
              className="hidden"
            />
          </label>
        </div>

        {branding.logos.length === 0 ? (
          <p className="mt-3 rounded border border-dashed border-brand-lea/20 bg-brand-cloudDancer/40 px-3 py-6 text-center text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            No logos yet. Click &ldquo;Add logo&rdquo; to upload one or more.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {branding.logos.map((logo) => (
              <div key={logo.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-brand-gold/90 p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.dataUrl} alt={logo.name} className="h-full w-full object-contain" />
                  </div>
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-brand-eden p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.dataUrl} alt={`${logo.name} on dark`} className="h-full w-full object-contain" />
                  </div>
                </div>
                <input
                  value={logo.name}
                  onChange={(event) => renameLogo(logo.id, event.target.value)}
                  className="mt-3 w-full rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                  placeholder="Logo name"
                />
                <button
                  type="button"
                  onClick={() => deleteLogo(logo.id)}
                  className="mt-2 text-xs font-semibold text-red-700 transition hover:underline dark:text-red-300"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignments */}
      <div className="mt-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Where each logo is used</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {BRANDING_SLOTS.map((slot) => {
            const assignedUrl = dataUrlFor(branding.assignments[slot.key]);
            return (
              <div key={slot.key} className="rounded border border-brand-lea/10 bg-white p-3 dark:border-white/10 dark:bg-brand-panel">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-brand-gold/90 p-1.5">
                    {assignedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={assignedUrl} alt={slot.label} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-[9px] font-semibold text-brand-lea dark:text-slate-100">None</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{slot.label}</div>
                  </div>
                </div>
                <select
                  value={branding.assignments[slot.key] ?? ""}
                  onChange={(event) => assignSlot(slot.key, event.target.value)}
                  className="mt-3 w-full rounded border border-brand-lea/15 bg-white px-2 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                >
                  <option value="">None</option>
                  {branding.logos.map((logo) => (
                    <option key={logo.id} value={logo.id}>
                      {logo.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
