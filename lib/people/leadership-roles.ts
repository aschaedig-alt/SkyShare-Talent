import { prisma } from "@/lib/prisma";
import { isPilotPosition } from "@/lib/orientation/defaults";

/**
 * SUPERVISORS BY ROLE.
 *
 * Asked for on 2026-11-10. David Ricks stepped down as Chief Pilot, Devon Carter
 * gave notice as Assistant Chief Pilot, Cameron Morgan and Alex Andrade took the
 * two jobs — and 83 pilots were still linked to Ricks and 82 to Carter, because a
 * supervisor slot named a PERSON. The ask: a pilot reports to "the Chief Pilot",
 * dotted-line to "the Assistant Chief Pilot", whoever holds those today.
 *
 * HOW IT WORKS — a follow, not a lookup. A slot that follows a role keeps its
 * supervisorHireId equal to the role's current holder, and setLeadershipRoleHolder
 * re-points every follower in the same transaction as the holder change. So the
 * ~10 places that read supervisorHire (orientation emails and digests, calendar
 * invites, reminders, supervisor-contact email, the profile) keep working without
 * knowing roles exist. The alternative — resolving the role at read time — meant
 * changing every one of those selects, and missing one would send to nobody.
 *
 * The cost of the copy: it is only right if the holder is changed HERE. Never
 * update LeadershipRole.holderHireId directly.
 */

import {
  LEADERSHIP_ROLES,
  PILOT_DEFAULT_SUPERVISOR_ROLE,
  PILOT_DEFAULT_SUPERVISOR2_ROLE,
  type LeadershipRoleKey,
  type LeadershipRoleView
} from "@/lib/people/leadership-role-keys";

export {
  LEADERSHIP_ROLES,
  isLeadershipRoleKey,
  leadershipRoleTitle,
  type LeadershipRoleKey,
  type LeadershipRoleView
} from "@/lib/people/leadership-role-keys";

/** Every role, in order, with its holder — creating any row that is missing. */
export async function listLeadershipRoles(): Promise<LeadershipRoleView[]> {
  const rows = await prisma.leadershipRole.findMany({
    include: { holder: { select: { id: true, name: true, position: true, ssEmail: true, personalEmail: true } } }
  });
  const missing = LEADERSHIP_ROLES.filter((r) => !rows.some((x) => x.key === r.key));
  if (missing.length > 0) {
    await prisma.leadershipRole.createMany({
      data: missing.map((r) => ({ key: r.key, title: r.title, sortOrder: r.sortOrder })),
      skipDuplicates: true
    });
  }
  const counts = await Promise.all(
    LEADERSHIP_ROLES.map((r) =>
      prisma.newHire.count({ where: { OR: [{ supervisorRoleKey: r.key }, { supervisor2RoleKey: r.key }] } })
    )
  );
  return LEADERSHIP_ROLES.map((r, i) => {
    const row = rows.find((x) => x.key === r.key);
    const h = row?.holder ?? null;
    return {
      key: r.key,
      title: r.title,
      holder: h ? { id: h.id, name: h.name, position: h.position, email: h.ssEmail?.trim() || h.personalEmail?.trim() || null } : null,
      followers: counts[i]
    };
  });
}

export type HolderChangeResult = {
  key: LeadershipRoleKey;
  holderHireId: string | null;
  /** Followers whose supervisor link now points at the new holder. */
  repointed: number;
  /** Followers who ARE the new holder — they cannot report to themselves, so they stop following. */
  selfCleared: string[];
};

/**
 * Give a role to someone (or vacate it with null) and re-point every follower.
 *
 * A vacant role leaves followers with no linked supervisor, which the orientation
 * send already reports as "no supervisor on file" rather than guessing — better
 * than silently still emailing the person who left.
 */
export async function setLeadershipRoleHolder(key: LeadershipRoleKey, holderHireId: string | null): Promise<HolderChangeResult> {
  const def = LEADERSHIP_ROLES.find((r) => r.key === key);
  if (!def) throw new Error(`Unknown leadership role: ${key}`);

  return prisma.$transaction(async (tx) => {
    await tx.leadershipRole.upsert({
      where: { key },
      create: { key, title: def.title, sortOrder: def.sortOrder, holderHireId },
      update: { holderHireId }
    });

    // The new holder may themselves follow this role (an Assistant Chief Pilot
    // promoted to Chief Pilot followed "chief-pilot"). Stop that first.
    const selfCleared: string[] = [];
    if (holderHireId) {
      const self = await tx.newHire.findUnique({
        where: { id: holderHireId },
        select: { name: true, supervisorRoleKey: true, supervisor2RoleKey: true }
      });
      if (self?.supervisorRoleKey === key) {
        await tx.newHire.update({ where: { id: holderHireId }, data: { supervisorRoleKey: null, supervisorHireId: null } });
        selfCleared.push(`${self.name} (supervisor)`);
      }
      if (self?.supervisor2RoleKey === key) {
        await tx.newHire.update({ where: { id: holderHireId }, data: { supervisor2RoleKey: null, supervisor2HireId: null } });
        selfCleared.push(`${self.name} (second supervisor)`);
      }
    }

    const a = await tx.newHire.updateMany({ where: { supervisorRoleKey: key }, data: { supervisorHireId: holderHireId } });
    const b = await tx.newHire.updateMany({ where: { supervisor2RoleKey: key }, data: { supervisor2HireId: holderHireId } });
    return { key, holderHireId, repointed: a.count + b.count, selfCleared };
  });
}

/** The fields to write so a slot follows a role. Typed fallbacks are cleared:
 *  with a vacant role they would otherwise be sent to instead. */
export async function followRoleData(slot: 1 | 2, key: LeadershipRoleKey) {
  const role = await prisma.leadershipRole.findUnique({ where: { key }, select: { holderHireId: true } });
  const holderId = role?.holderHireId ?? null;
  const data =
    slot === 1
      ? { supervisorRoleKey: key, supervisorHireId: holderId, supervisorName: null, supervisorEmail: null }
      : { supervisor2RoleKey: key, supervisor2HireId: holderId, supervisor2Name: null, supervisor2Email: null };
  return { holderId, data };
}

/**
 * Default a pilot's supervisors to the Chief Pilot and Assistant Chief Pilot.
 *
 * Only when BOTH slots are completely empty — no link, no typed name, no role. A
 * supervisor somebody chose by hand is never overwritten. Skips non-pilots, the
 * chief pilot's office itself, and the role holders (nobody reports to
 * themselves). Safe to call after any create or position change.
 *
 * Returns true when it set the default.
 */
export async function applyPilotSupervisorDefault(hireId: string): Promise<boolean> {
  const h = await prisma.newHire.findUnique({
    where: { id: hireId },
    select: {
      position: true,
      supervisorHireId: true,
      supervisorName: true,
      supervisorEmail: true,
      supervisorRoleKey: true,
      supervisor2HireId: true,
      supervisor2Name: true,
      supervisor2Email: true,
      supervisor2RoleKey: true,
      _count: { select: { leadershipRolesHeld: true } }
    }
  });
  if (!h || !isPilotPosition(h.position)) return false;
  if (/chief pilot/i.test(h.position ?? "") || h._count.leadershipRolesHeld > 0) return false;
  const anySet = [
    h.supervisorHireId,
    h.supervisorName,
    h.supervisorEmail,
    h.supervisorRoleKey,
    h.supervisor2HireId,
    h.supervisor2Name,
    h.supervisor2Email,
    h.supervisor2RoleKey
  ].some((v) => v && String(v).trim());
  if (anySet) return false;

  const [one, two] = await Promise.all([
    followRoleData(1, PILOT_DEFAULT_SUPERVISOR_ROLE),
    followRoleData(2, PILOT_DEFAULT_SUPERVISOR2_ROLE)
  ]);
  await prisma.newHire.update({ where: { id: hireId }, data: { ...one.data, ...two.data } });
  return true;
}
