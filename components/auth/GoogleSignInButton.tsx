"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

type GoogleSignInButtonProps = {
  callbackUrl: string;
  /**
   * The address this link was issued to. Forwarded to Google as login_hint, so
   * somebody already signed into a personal account lands on the right one
   * instead of the account chooser — the usual way an invite fails is that the
   * person signs in with the Gmail they happen to be in and gets refused.
   * A hint only: Google still lets them switch, and it grants nothing on its own.
   */
  loginHint?: string;
};

export function GoogleSignInButton({ callbackUrl, loginHint }: GoogleSignInButtonProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);

  return (
    <button
      type="button"
      aria-busy={isSigningIn}
      onClick={() => {
        setIsSigningIn(true);
        void signIn("google", { callbackUrl }, loginHint ? { login_hint: loginHint } : undefined);
      }}
      disabled={isSigningIn}
      className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-wait disabled:opacity-70"
    >
      {isSigningIn ? "Opening Google..." : "Sign in with Google"}
    </button>
  );
}
