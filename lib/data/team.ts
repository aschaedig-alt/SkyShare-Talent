import { prisma } from "@/lib/prisma";

/**
 * The people who can be recorded as an interviewer or @-mentioned.
 *
 * Drawn from User rather than the new-hire roster: a mention has to reach
 * somebody who can actually open the app, and an interviewer has to be an
 * identity the recent-interviews filter can match on. Viewers are included —
 * they can be mentioned and can read a candidate even if they cannot edit.
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
