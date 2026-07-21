import { prisma } from "@/lib/prisma";
import { frontFetch } from "./client";

// Which mailbox we send from. The channel_id (cha_...) is stable once resolved, so
// we look it up from the mailbox address once and cache it in a WorkspaceSetting —
// same layered-config pattern as onboarding-grid-config — instead of spending a
// GET /channels on every send.

const SCOPE = "front";
const KEY = "channels";

// The mailbox we send orientation mail from, matched against a channel's send_as (the
// outward @skyshare.com address). Chosen: hrotasks@ — an HR automation mailbox, so
// automated sends stay out of the human hr@ inbox. NOTE: a channel's `address` field
// is Front's internal @in.frontapp.com routing address, NOT the sending address —
// always resolve on send_as/name. Confirmed channels: hr@ (cha_g7t22), recruiting@
// (cha_g7t3u), hrotasks@ (cha_g7u1m), pilotapp@ (cha_g9gii).
export const ORIENTATION_CHANNEL_ADDRESS = "hrotasks@skyshare.com";

type ChannelMap = Record<string, string>; // send_as address -> channel_id

type FrontChannel = {
  id: string;
  address?: string; // internal @in.frontapp.com routing address — do not match on this
  name?: string;
  send_as?: string; // the outward-facing @skyshare.com address we send from
  type?: string;
};

async function readMap(): Promise<ChannelMap> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as ChannelMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: ChannelMap): Promise<void> {
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(map) },
    update: { valueJson: JSON.stringify(map) },
  });
}

/** Resolve a mailbox address to its Front channel id, hitting the API only on a
 *  cache miss and remembering the result. Throws if no channel matches. */
export async function getChannelId(address: string): Promise<string> {
  const map = await readMap();
  const cached = map[address.toLowerCase()];
  if (cached) return cached;

  const wanted = address.toLowerCase();
  const page = await frontFetch<{ _results: FrontChannel[] }>("/channels");
  const match = page._results.find(
    (c) =>
      c.send_as?.toLowerCase() === wanted || c.name?.toLowerCase() === wanted
  );
  if (!match) {
    throw new Error(`No Front channel found for ${address}`);
  }

  map[address.toLowerCase()] = match.id;
  await writeMap(map);
  return match.id;
}

/** Convenience for the orientation send-from mailbox (hrotasks@). */
export function getOrientationChannelId(): Promise<string> {
  return getChannelId(ORIENTATION_CHANNEL_ADDRESS);
}
