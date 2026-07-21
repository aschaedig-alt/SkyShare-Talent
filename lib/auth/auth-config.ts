export type AuthRuntimeStatus = {
  mode: "local-bypass" | "required-not-configured" | "provider-configured" | "google-session-validation";
  provider: string | null;
  requireAuth: boolean;
  googleConfigured: boolean;
  allowlistConfigured: boolean;
  detail: string;
};

let warnedAboutBypass = false;

/**
 * Is real authentication enforced?
 *
 * This used to ask "is NODE_ENV production?", which meant ANY hosted deployment
 * whose NODE_ENV was something else — staging, a misconfigured slot — silently
 * granted full ADMIN access to everyone. Production was safe only because Vercel
 * happens to set NODE_ENV=production. That is a big consequence resting on an
 * incidental default.
 *
 * Inverted here: auth is required EVERYWHERE except a machine that is
 * demonstrably local dev. Anything running on Vercel is hosted by definition, so
 * VERCEL_ENV being present is disqualifying on its own, whatever NODE_ENV says.
 *
 * NOTE: middleware.ts keeps its own copy of this (the edge bundle can't import
 * server modules). Change both together.
 */
export function isAuthRequired() {
  // Explicit opt-in always wins — this is how you test real auth locally.
  if (process.env.REQUIRE_AUTH === "true") return true;

  const isLocalDev =
    process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV && !process.env.VERCEL;

  if (isLocalDev && !warnedAboutBypass) {
    warnedAboutBypass = true;
    console.warn(
      "[auth] Local development bypass is ACTIVE — every request is treated as ADMIN. " +
        "This database is the live one; set REQUIRE_AUTH=true to exercise real sign-in."
    );
  }

  return !isLocalDev;
}

function hasGoogleCredentials() {
  return Boolean(
    (process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET) &&
      (process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID) &&
      (process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)
  );
}

function hasAllowlist() {
  return Boolean(process.env.AUTH_ADMIN_EMAILS || process.env.AUTH_ALLOWED_EMAILS || process.env.AUTH_ALLOWED_DOMAINS);
}

export function getAuthRuntimeStatus(): AuthRuntimeStatus {
  const provider = process.env.AUTH_PROVIDER?.trim() || null;
  const requireAuth = isAuthRequired();
  const googleConfigured = hasGoogleCredentials();
  const allowlistConfigured = hasAllowlist();

  if (!requireAuth) {
    return {
      mode: "local-bypass",
      provider,
      requireAuth,
      googleConfigured,
      allowlistConfigured,
      detail: "Local development bypass is active. Do not use this mode for real candidate data."
    };
  }

  if (!provider || !googleConfigured || !allowlistConfigured) {
    return {
      mode: "required-not-configured",
      provider,
      requireAuth,
      googleConfigured,
      allowlistConfigured,
      detail:
        "Authentication is required, but Google auth credentials and an allowed email/domain list must be configured before access is allowed."
    };
  }

  return {
    mode: "google-session-validation",
    provider,
    requireAuth,
    googleConfigured,
    allowlistConfigured,
    detail: "Google authentication and signed session validation are configured."
  };
}
