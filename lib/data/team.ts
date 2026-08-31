import { prisma } from "@/lib/prisma";

/**
 * The people who can be @-MENTIONED.
 *
 * Drawn from User on purpose and deliberately NOT widened: a mention has to
 * reach somebody who can actually open the app, so putting a non-user in this
 * list would send a notification nowhere. Viewers are included — they can be
 * mentioned and can read a candidate even if they cannot edit.
 *
 * Interviewers are a DIFFERENT and larger set — see getInterviewers below.
 * These two were one list until 2026-08-31, which is why hiring managers who do
 * not use the app could not be recorded as having run an interview.
 */
export type TeamMember = { name: string; email: string };

export async function getTeamMembers(): Promise<TeamMember[]> {
  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    select: { name: true, email: true },
    orderBy: { name: "asc" }
  });
  return users
    .filter((u): u is { name: string | null; email: string } => Boolean(u.email))
    .map((u) => ({ name: u.name?.trim() || u.email, email: u.email.toLowerCase() }));
}

/**
 * The people who can be recorded as having RUN an interview.
 *
 * Wider than getTeamMembers, and that is the whole point. Interviewing does not
 * require an account: hiring managers sit in on interviews long before they ever
 * sign in, and until 2026-08-31 the only way to get a name onto this list was to
 * hand-create a User row — which is the documented trap in this repo, because a
 * pre-created row locks that person out of Google sign-in with
 * OAuthAccountNotLinked. An invite does not help either: it writes a UserInvite
 * and the User row is not created until their FIRST successful sign-in.
 *
 * So this unions Users with BookingHosts. Hosts already exist for exactly these
 * people, carry a real @skyshare address, and can be added from Scheduling admin
 * without granting anybody access. A host who is not accepting bookings is still
 * a perfectly good interviewer, so isActive is deliberately ignored here — it
 * governs the booking calendar, not who sat in a room.
 *
 * A HOST WITHOUT AN EMAIL IS SKIPPED, not given a placeholder. Interview.interviewerEmail
 * is the identity the recent-interviews filter matches on, and the schema says so
 * outright: a name is not stable enough, since two people typing theirs
 * differently breaks the filter. A row that cannot carry an identity should not
 * be offered as one. Today that skips "SkyShare Recruiting", a shared inbox
 * rather than a person, which is the right outcome.
 */
export async function getInterviewers(): Promise<TeamMember[]> {
  const [users, hosts] = await Promise.all([
    prisma.user.findMany({
      where: { email: { not: null } },
      select: { name: true, email: true }
    }),
    prisma.bookingHost.findMany({
      where: { email: { not: null } },
      select: { name: true, email: true }
    })
  ]);

  // Users first so a real account's display name wins over a host record's.
  const byEmail = new Map<string, TeamMember>();
  for (const u of users) {
    if (!u.email) continue;
    const email = u.email.toLowerCase();
    if (!byEmail.has(email)) byEmail.set(email, { name: u.name?.trim() || u.email, email });
  }
  for (const h of hosts) {
    if (!h.email) continue;
    const email = h.email.toLowerCase();
    if (!byEmail.has(email)) byEmail.set(email, { name: h.name.trim() || h.email, email });
  }

  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
}
