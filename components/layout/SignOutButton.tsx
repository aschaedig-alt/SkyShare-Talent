"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

// A real way to log out. Posts to next-auth's /api/auth/signout (no SessionProvider
// needed) and lands the user on /login. Two shapes: an icon-only button for the
// narrow desktop rail, and a full-width row (with the signed-in email) for the
// mobile drawer.
export function SignOutButton({ email, collapsed = false }: { email?: string | null; collapsed?: boolean }) {
  const label = email ? `Sign out — ${email}` : "Sign out";
  const doSignOut = () => signOut({ callbackUrl: "/login" });

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={doSignOut}
        title={label}
        aria-label={label}
        data-dialog-close
        className="mt-2 flex h-9 w-9 items-center justify-center rounded text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <LogOut className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="space-y-1">
      {email ? (
        <div className="truncate px-2 text-[11px] text-white/55" title={email}>
          {email}
        </div>
      ) : null}
      <button
        type="button"
        onClick={doSignOut}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white"
      >
        <LogOut className="h-4 w-4 shrink-0" /> Sign out
      </button>
    </div>
  );
}
