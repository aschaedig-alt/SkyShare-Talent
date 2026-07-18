// Test-data markers — the single definition of what counts as safely deletable
// "test" data. Because dev and prod share ONE live Neon database, deletion is
// gated on these markers so a real candidate or a real employee's login can
// never be removed by accident: only records the operator explicitly marked as
// test are eligible, and even then the delete endpoints add an admin check and a
// typed-name/email confirmation on top (defense in depth).

/** The tag a candidate must carry to be eligible for test deletion. */
export const TEST_TAG = "TEST";

/** True if any of the candidate's tags is the TEST marker (case-insensitive). */
export function isTestTagged(tags: readonly string[] | null | undefined): boolean {
  if (!tags) return false;
  return tags.some((t) => t.trim().toUpperCase() === TEST_TAG);
}

// Email domains treated as test accounts. Reserved / non-routable by convention,
// so a login using one is deliberately a throwaway.
const TEST_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net", "test.com", "test.local"]);

/**
 * True if an auth user's email marks it as a test account — either an explicit
 * "+test" sub-address (e.g. you+test@gmail.com, which routes to your real inbox
 * but is unmistakably intentional) or one of the reserved test domains above.
 * A real employee's login will never match, so it cannot be deleted.
 */
export function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (TEST_EMAIL_DOMAINS.has(domain)) return true;
  // "+test" or "+test-..." sub-address in the local part.
  return /\+test(\b|[-.])/.test(local) || local.endsWith("+test");
}
