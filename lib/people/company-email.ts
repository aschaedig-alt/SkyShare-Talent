// The SkyShare company email convention: first initial + last name @skyshare.com.
// Hankyu Park -> hpark@skyshare.com.
//
// Derived by default everywhere a company address is captured, because it feeds
// the business cards — a card with the wrong address is worthless.
//
// Checked against the real roster (Jul 2026): 158 of the 175 hires who have an
// address match this exactly. The 17 that do not are early employees on
// first-name addresses (jonathan@, andrea@, charles@) and nicknames — legacy, not
// a competing rule. So this is the default, always editable, never forced.

import { prisma } from "@/lib/prisma";

export const COMPANY_EMAIL_DOMAIN = "skyshare.com";

/**
 * Build the conventional address from a full name.
 *
 * The last name is EVERYTHING after the first name, not just the final word:
 * Don St George is dstgeorge@, not dgeorge@ (verified against his real address).
 * Returns null when there is no surname to work with — one-word names get no
 * guess rather than a wrong one.
 */
export function deriveCompanyEmail(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const initial = parts[0][0] ?? "";
  const surname = parts.slice(1).join("");
  const local = `${initial}${surname}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  return local ? `${local}@${COMPANY_EMAIL_DOMAIN}` : null;
}

export type CompanyEmailSuggestion = {
  /** The conventional address, or null if the name cannot produce one. */
  email: string | null;
  /** Someone already has it. NEVER silently assign over this. */
  takenBy: string | null;
};

/**
 * The conventional address plus whether it is already in use.
 *
 * The convention genuinely collides: Kevin Sherman and Kieran Sherman both derive
 * to ksherman@, and that is exactly why Kieran's real address is kieran@. Seven
 * such pairs exist on the current roster. Two people sharing a mailbox is a
 * real-world failure, so a clash is surfaced for a human rather than resolved by
 * a rule we invented.
 */
export async function suggestCompanyEmail(
  fullName: string | null | undefined,
  opts?: { ignoreHireId?: string }
): Promise<CompanyEmailSuggestion> {
  const email = deriveCompanyEmail(fullName);
  if (!email) return { email: null, takenBy: null };

  const existing = await prisma.newHire.findFirst({
    where: {
      ssEmail: { equals: email, mode: "insensitive" },
      ...(opts?.ignoreHireId ? { NOT: { id: opts.ignoreHireId } } : {})
    },
    select: { name: true }
  });

  return { email, takenBy: existing?.name ?? null };
}
