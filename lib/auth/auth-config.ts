export type AuthRuntimeStatus = {
  mode: "local-bypass" | "required-not-configured" | "provider-configured" | "google-session-validation";
  provider: string | null;
  requireAuth: boolean;
  googleConfigured: boolean;
  allowlistConfigured: boolean;
  detail: string;
};

export function isAuthRequired() {
  return process.env.REQUIRE_AUTH === "true" || process.env.NODE_ENV === "production";
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
