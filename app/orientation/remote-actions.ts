"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { hasPermission, isRoleName } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import {
  getRemoteLinks,
  getRemoteLunches,
  saveRemoteLinks,
  saveRemoteLunch,
  type RemoteLink,
  type RemoteLunch
} from "@/lib/orientation/remote-kit";

// The Remote attendees panel: the standing orientation links, and each remote
// attendee's lunch delivery. Same permission as sending orientation email —
// these feed straight into that email.

async function canEdit(): Promise<boolean> {
  if (!isAuthRequired()) return true;
  const session = await getServerSession(authOptions).catch(() => null);
  const role = session?.user?.role;
  return isRoleName(role) && hasPermission(role, "candidates:write");
}

export type RemoteKitResult = {
  ok: boolean;
  error?: string;
  links?: RemoteLink[];
  lunches?: Record<string, RemoteLunch>;
};

export async function loadRemoteKit(sessionId: string): Promise<RemoteKitResult> {
  // Lunches are read for THIS session's attendees only, looked up server-side,
  // so a client cannot ask for somebody else's delivery address by id.
  const attendees = await prisma.orientationAttendee.findMany({ where: { sessionId }, select: { id: true } });
  const [links, lunches] = await Promise.all([getRemoteLinks(), getRemoteLunches(attendees.map((a) => a.id))]);
  return { ok: true, links, lunches };
}

export async function updateRemoteLinks(links: RemoteLink[]): Promise<RemoteKitResult> {
  if (!(await canEdit())) return { ok: false, error: "You don't have permission to change these links." };
  try {
    return { ok: true, links: await saveRemoteLinks(links) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save the links." };
  }
}

export async function updateRemoteLunch(
  attendeeId: string,
  lunch: RemoteLunch
): Promise<{ ok: boolean; error?: string; lunch?: RemoteLunch }> {
  if (!(await canEdit())) return { ok: false, error: "You don't have permission to change this." };
  const exists = await prisma.orientationAttendee.findUnique({ where: { id: attendeeId }, select: { id: true } });
  if (!exists) return { ok: false, error: "Attendee not found." };
  try {
    return { ok: true, lunch: await saveRemoteLunch(attendeeId, lunch) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save lunch." };
  }
}
