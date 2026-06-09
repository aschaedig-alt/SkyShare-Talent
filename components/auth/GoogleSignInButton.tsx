"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

type GoogleSignInButtonProps = {
  callbackUrl: string;
};

export function GoogleSignInButton({ callbackUrl }: GoogleSignInButtonProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);

  return (
    <button
      type="button"
      aria-busy={isSigningIn}
      onClick={() => {
        setIsSigningIn(true);
        void signIn("google", { callbackUrl });
      }}
      disabled={isSigningIn}
      className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-wait disabled:opacity-70"
    >
      {isSigningIn ? "Opening Google..." : "Sign in with Google"}
    </button>
  );
}
