"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  EXEC_HUNT_NAME_MAX,
  EXEC_HUNT_PUBLIC_BASE,
  EXEC_HUNT_STORAGE_KEY,
  type ExecHuntClaimResult,
  type ExecHuntProgress
} from "@/lib/exec-hunt/constants";
import { ExecPhoto, FESTIVE } from "@/components/exec-hunt/FestiveShell";
import { GuestProgress } from "@/components/exec-hunt/GuestProgress";

// The page a printed QR code opens. How a returning guest is recognised:
//   1. localStorage holds { token, name } from this phone's first claim;
//   2. the same token is in an httpOnly cookie, so a cleared localStorage still works.
// On load the page always TRIES the claim with whatever it has. The server answers
// "needs-name" only when neither copy identifies a guest - then, and only then,
// the name box appears. So a returning guest scans and sees the result with no
// typing at all.

type Stored = { token?: string; name?: string };

export function readStoredGuest(): Stored {
  try {
    const raw = window.localStorage.getItem(EXEC_HUNT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

export function writeStoredGuest(value: Stored) {
  try {
    window.localStorage.setItem(EXEC_HUNT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode etc. - the cookie still carries the token.
  }
}

type Done = {
  status: "claimed" | "already";
  label: string;
  name: string;
  slug: string;
  progress: ExecHuntProgress;
};

type Phase =
  | { kind: "loading" }
  | { kind: "name" }
  | { kind: "done"; result: Done }
  | { kind: "closed"; message: string }
  | { kind: "error"; message: string };

export function ScanClient({
  publicKey,
  label,
  executiveName,
  photoUrl
}: {
  publicKey: string;
  label: string;
  executiveName: string;
  photoUrl: string | null;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const claim = useCallback(
    async (withName: string | null) => {
      // One request at a time: a double-tap must not send two.
      if (inFlight.current) return;
      inFlight.current = true;
      setSubmitting(true);
      const stored = readStoredGuest();
      try {
        const response = await fetch("/api/christmas/exec-hunt/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: publicKey, token: stored.token ?? null, name: withName })
        });
        const data = (await response.json().catch(() => null)) as (ExecHuntClaimResult & { message?: string }) | null;
        if (!data) throw new Error("bad response");
        if (data.status === "needs-name") {
          setName(stored.name ?? "");
          setPhase({ kind: "name" });
        } else if (data.status === "closed") {
          setPhase({ kind: "closed", message: data.message });
        } else if (data.status === "claimed" || data.status === "already") {
          writeStoredGuest({ token: data.guest.token ?? stored.token, name: data.guest.name });
          setPhase({
            kind: "done",
            result: {
              status: data.status,
              label: data.picture.label,
              name: data.guest.name,
              slug: data.picture.slug,
              progress: data.progress
            }
          });
        } else {
          setPhase({ kind: "error", message: data.message ?? "We couldn't record that one. Try scanning again." });
        }
      } catch {
        setPhase({
          kind: "error",
          message: "We couldn't reach the server. Check your signal and tap Try again."
        });
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [publicKey]
  );

  useEffect(() => {
    void claim(null);
  }, [claim]);

  async function startOver() {
    writeStoredGuest({});
    await fetch("/api/christmas/exec-hunt/forget", { method: "POST" }).catch(() => null);
    setName("");
    setPhase({ kind: "name" });
  }

  async function saveRename() {
    const stored = readStoredGuest();
    setRenameError(null);
    const response = await fetch("/api/christmas/exec-hunt/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: stored.token ?? null, name: renameValue })
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { ok?: boolean; name?: string; message?: string } | null;
    if (!response?.ok || !data?.ok || !data.name) {
      setRenameError(data?.message ?? "Couldn't change the name. Try again.");
      return;
    }
    writeStoredGuest({ ...stored, name: data.name });
    setRenaming(false);
    setPhase((current) =>
      current.kind === "done" ? { kind: "done", result: { ...current.result, name: data.name! } } : current
    );
  }

  return (
    <div className="space-y-4">
      <section className={`${FESTIVE.card} text-center`}>
        <div className="flex justify-center">
          <ExecPhoto name={executiveName} photoUrl={photoUrl} />
        </div>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.2em] text-[#c8102e]">You found</p>
        <p className="text-4xl font-extrabold text-[#0f5132] dark:text-emerald-300">{label}!</p>
      </section>

      {phase.kind === "loading" ? (
        <section className={`${FESTIVE.card} text-center text-lg font-semibold`}>Checking your list... 🎁</section>
      ) : null}

      {phase.kind === "name" ? (
        <form
          className={`${FESTIVE.card} space-y-4`}
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) void claim(name.trim());
          }}
        >
          <p className="text-center text-lg font-bold">Enter your name to record your discovery!</p>
          <label className="block space-y-1">
            <span className={FESTIVE.label}>Your name</span>
            <input
              className={FESTIVE.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={EXEC_HUNT_NAME_MAX}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="go"
              required
              autoFocus
              placeholder="e.g. Jamie Smith"
            />
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            We&apos;ll remember you on this phone, so the next scan is instant. First and last name helps if two
            people share a name.
          </p>
          <button type="submit" className={FESTIVE.bigButton} disabled={submitting || !name.trim()}>
            {submitting ? "Recording..." : "Claim Discovery 🎉"}
          </button>
        </form>
      ) : null}

      {phase.kind === "done" ? (
        <section className={`${FESTIVE.card} space-y-4`}>
          {phase.result.status === "claimed" ? (
            <div className="text-center">
              <p className="text-3xl" aria-hidden>
                🎉
              </p>
              <p className="text-xl font-extrabold text-[#0f5132] dark:text-emerald-300">Discovery recorded!</p>
              <p className="text-base font-semibold">You&apos;ve found {phase.result.label}!</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-3xl" aria-hidden>
                🔁
              </p>
              <p className="text-xl font-extrabold text-[#c8102e]">You&apos;ve already found this one!</p>
              <p className="text-base font-semibold">Keep searching!</p>
            </div>
          )}

          <GuestProgress progress={phase.result.progress} highlight={phase.result.status === "claimed" ? phase.result.slug : null} />

          <div className="border-t border-slate-200 pt-3 text-sm dark:border-white/10">
            {renaming ? (
              <div className="space-y-2">
                <input
                  className={FESTIVE.input}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  maxLength={EXEC_HUNT_NAME_MAX}
                  autoFocus
                />
                {renameError ? <p className="text-sm font-semibold text-[#c8102e]">{renameError}</p> : null}
                <div className="flex gap-2">
                  <button type="button" className={FESTIVE.ghostButton} onClick={() => void saveRename()}>
                    Save name
                  </button>
                  <button type="button" className={FESTIVE.ghostButton} onClick={() => setRenaming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Playing as <strong>{phase.result.name}</strong>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={FESTIVE.ghostButton}
                    onClick={() => {
                      setRenameValue(phase.result.name);
                      setRenaming(true);
                    }}
                  >
                    Change name
                  </button>
                  <button type="button" className={FESTIVE.ghostButton} onClick={() => void startOver()}>
                    Not me
                  </button>
                </span>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {phase.kind === "closed" ? (
        <section className={`${FESTIVE.card} text-center text-lg font-semibold`}>{phase.message}</section>
      ) : null}

      {phase.kind === "error" ? (
        <section className={`${FESTIVE.card} space-y-3 text-center`}>
          <p className="text-lg font-semibold">{phase.message}</p>
          <button type="button" className={FESTIVE.bigButton} onClick={() => void claim(null)} disabled={submitting}>
            Try again
          </button>
        </section>
      ) : null}

      <p className="text-center text-sm">
        <Link href={EXEC_HUNT_PUBLIC_BASE} className="font-semibold text-brand-gold underline-offset-2 hover:underline">
          How to play &amp; your progress
        </Link>
      </p>
    </div>
  );
}
