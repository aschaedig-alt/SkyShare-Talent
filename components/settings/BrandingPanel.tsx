"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type BrandingPanelProps = {
  initialLogoDataUrl: string | null;
};

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_FILE_BYTES = 650 * 1024; // keep the stored data URL comfortably under the server cap

export function BrandingPanel({ initialLogoDataUrl }: BrandingPanelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [savedLogo, setSavedLogo] = useState<string | null>(initialLogoDataUrl);
  const [pending, setPending] = useState<string | null>(null); // selected-but-unsaved logo
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = pending ?? savedLogo;
  const dirty = pending !== null && pending !== savedLogo;

  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setStatus(null);
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Use a PNG, JPG, WEBP, GIF, or SVG image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`That file is ${Math.round(file.size / 1024)} KB. Please keep it under ${Math.round(MAX_FILE_BYTES / 1024)} KB.`);
      return;
    }
    try {
      const dataUrl = await readFile(file);
      setPending(dataUrl);
    } catch {
      setError("Could not read that file. Try a different one.");
    }
  }

  async function persist(logoDataUrl: string | null) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/workspace-settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoDataUrl })
      });
      const payload = (await response.json().catch(() => null)) as { logoDataUrl?: string | null; message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to save the logo.");
      }
      setSavedLogo(payload?.logoDataUrl ?? null);
      setPending(null);
      setStatus(logoDataUrl ? "Logo saved. It now shows in the sidebar." : "Logo removed.");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save the logo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Branding</p>
      <h2 className="text-base font-semibold text-brand-lea">Workspace logo</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-grey">
        Upload your SkyShare logo. It appears in the top tile of the sidebar and the mobile menu header. A square,
        transparent PNG or SVG works best. Max ~650&nbsp;KB.
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-5">
        {/* Live preview on the gold tile, exactly like the sidebar */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-[4px] bg-brand-gold/90 p-1.5">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Logo preview" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] font-semibold text-brand-lea">No logo</span>
            )}
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-brand-grey">Sidebar tile</span>
        </div>

        {/* Preview on a dark rail background, to check contrast */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-[4px] bg-brand-eden p-1.5">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Logo preview on dark" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] font-semibold text-white/70">No logo</span>
            )}
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-brand-grey">On dark rail</span>
        </div>

        <div className="flex min-w-[220px] flex-1 flex-col gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            onChange={onPick}
            disabled={busy}
            className="block w-full text-sm text-brand-grey file:mr-3 file:rounded file:border-0 file:bg-brand-lea file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-eden"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => pending && persist(pending)}
              disabled={busy || !dirty}
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Saving..." : "Save logo"}
            </button>
            {pending ? (
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setError(null);
                  setStatus(null);
                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }
                }}
                disabled={busy}
                className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-60"
              >
                Cancel
              </button>
            ) : null}
            {savedLogo ? (
              <button
                type="button"
                onClick={() => persist(null)}
                disabled={busy}
                className="rounded border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                Remove logo
              </button>
            ) : null}
          </div>

          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
          {status ? <p className="text-sm font-medium text-emerald-700">{status}</p> : null}
        </div>
      </div>
    </section>
  );
}
