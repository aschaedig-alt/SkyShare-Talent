import { prisma } from "@/lib/prisma";

// Access blocklist — the real revocation mechanism. Sessions are JWT and sign-in
// is gated by an email/domain allowlist, so deleting a User row alone does NOT
// keep someone out: their token stays valid until it expires, and if their domain
// is allowed they get recreated as a viewer on the next sign-in. Blocking their
// email is what actually holds: sign-in is refused and every access gate rejects
// them on their next request. Stored as a WorkspaceSetting (no schema migration)
// so it is reversible — remove the email to restore access.

const SCOPE = "workspace";
const KEY = "auth-blocklist";

function norm(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export async function getBlockedEmails(): Promise<string[]> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return [];

  // A stored blocklist we cannot read FAILS OPEN — it returns an empty list, so
  // isEmailBlocked() answers false for everyone and nobody is revoked. That is a
  // deliberate choice, not an oversight: this runs on the sign-in path and on every
  // access gate, so failing closed on a corrupt setting would lock the ENTIRE
  // company out of the app to keep out the handful of people on the list. The
  // blast radius of the safe-looking option is much larger than the risk it covers.
  //
  // The trade-off is only acceptable if the corruption is noticed, hence the loud
  // logs below — a silent empty return is what made this dangerous. If one of these
  // fires, a revoked person may still have access: fix the WorkspaceSetting row
  // (scope "workspace", key "auth-blocklist") and treat it as urgent.
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    if (!Array.isArray(parsed)) {
      console.error(
        `[auth/blocklist] WorkspaceSetting ${SCOPE}/${KEY} parsed as ${typeof parsed}, expected an array. ` +
          `Failing OPEN — nobody is blocked until this is fixed. Stored value: ${row.valueJson.slice(0, 200)}`
      );
      return [];
    }
    return parsed.map((e) => norm(String(e))).filter(Boolean);
  } catch (error) {
    console.error(
      `[auth/blocklist] WorkspaceSetting ${SCOPE}/${KEY} is not valid JSON. ` +
        `Failing OPEN — nobody is blocked until this is fixed. Stored value: ${row.valueJson.slice(0, 200)}`,
      error
    );
    return [];
  }
}

export async function isEmailBlocked(email: string | null | undefined): Promise<boolean> {
  const e = norm(email);
  if (!e) return false;
  return (await getBlockedEmails()).includes(e);
}

async function save(emails: string[]) {
  const value = JSON.stringify([...new Set(emails.map(norm).filter(Boolean))]);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}

export async function blockEmail(email: string): Promise<void> {
  const e = norm(email);
  if (!e) return;
  const current = await getBlockedEmails();
  if (current.includes(e)) return;
  await save([...current, e]);
}

export async function unblockEmail(email: string): Promise<void> {
  const e = norm(email);
  const current = await getBlockedEmails();
  await save(current.filter((x) => x !== e));
}
