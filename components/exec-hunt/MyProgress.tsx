"use client";

import { useEffect, useState } from "react";
import type { ExecHuntProgress } from "@/lib/exec-hunt/constants";
import { FESTIVE } from "@/components/exec-hunt/FestiveShell";
import { GuestProgress } from "@/components/exec-hunt/GuestProgress";
import { readStoredGuest } from "@/components/exec-hunt/ScanClient";

/** This phone's own progress, if it has played. */
export function MyProgress() {
  const [state, setState] = useState<{ name: string; progress: ExecHuntProgress } | null | "loading">("loading");

  useEffect(() => {
    const stored = readStoredGuest();
    fetch("/api/christmas/exec-hunt/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: stored.token ?? null })
    })
      .then((response) => response.json())
      .then((data: { guest: { name: string } | null; progress?: ExecHuntProgress }) =>
        setState(data.guest && data.progress ? { name: data.guest.name, progress: data.progress } : null)
      )
      .catch(() => setState(null));
  }, []);

  if (state === "loading" || state === null) return null;
  return (
    <section className={`${FESTIVE.card} space-y-2`}>
      <p className="text-sm">
        Playing as <strong>{state.name}</strong>
      </p>
      <GuestProgress progress={state.progress} />
    </section>
  );
}
