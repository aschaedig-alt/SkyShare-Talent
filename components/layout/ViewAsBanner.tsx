"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

/**
 * Start or stop View as (lib/auth/view-as.ts).
 *
 * There is no SessionProvider in this app, so this does by hand what next-auth's
 * useSession().update() does: fetch a CSRF token, then POST the update to
 * /api/auth/session. next-auth runs the jwt callback with trigger "update", which
 * is where the server decides — against the database — whether to honour it.
 * Returns the resulting session so the caller can tell whether it took.
 */
export async function requestViewAs(userId: string | null): Promise<{ viewAs?: unknown } | null> {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken?: string };
  if (!csrfToken) return null;

  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csrfToken, data: { viewAs: userId } }),
    cache: "no-store"
  });
  if (!response.ok) return null;
  return (await response.json()) as { viewAs?: unknown };
}

export function ViewAsBanner({
  viewingName,
  viewingEmail,
  viewingRole,
  realEmail,
  expiresAt
}: {
  viewingName: string | null;
  viewingEmail: string | null;
  viewingRole: string;
  realEmail: string | null;
  expiresAt: number;
}) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endsAt = new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const exit = async () => {
    setLeaving(true);
    setError(null);
    try {
      await requestViewAs(null);
      // A full load, not a client navigation: every server component has to
      // re-render as the admin again, sidebar included.
      window.location.assign("/settings/users");
    } catch {
      setError("Could not exit. Signing out also ends View as.");
      setLeaving(false);
    }
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-brand-gold bg-brand-lea px-4 py-2.5 text-sm text-white print:hidden lg:px-8"
    >
      <Eye className="h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Viewing as {viewingName ?? viewingEmail ?? "this user"}</span>
        {viewingName && viewingEmail ? <span className="text-brand-sweet"> · {viewingEmail}</span> : null}
        <span className="text-brand-sweet"> · {viewingRole}</span>
        <span className="block text-xs text-brand-sweet">
          Read-only: you see what they see, and nothing can be saved. Ends on its own at {endsAt}
          {realEmail ? ` · signed in as ${realEmail}` : ""}
        </span>
        {error ? <span className="block text-xs text-brand-gold">{error}</span> : null}
      </p>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:shadow-[0_0_0_3px_rgba(234,170,0,0.35)] disabled:opacity-60"
      >
        {leaving ? "Exiting…" : "Exit View as"}
      </button>
    </div>
  );
}
