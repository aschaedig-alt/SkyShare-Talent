import { prisma } from "@/lib/prisma";

// The third state for the attendee grid's CREDIT CARD column: "not needed".
//
// Asked for directly ("i need to be able to mark card 'not needed' on
// orientation/onboarding") — the onboarding grid has had TODO / DONE / NA for a
// while, and the orientation grid's circle was strictly on/off, so somebody who
// is not getting a card sat there as an empty circle that looked like an
// outstanding job forever.
//
// OrientationAttendee.cardReady is a boolean column on the SHARED LIVE database,
// and turning it into a tri-state means a migration against production. So the
// third state is stored beside it in a WorkspaceSetting, exactly as the reminder
// arming and the orientation send records already are (lib/orientation/reminder.ts,
// lib/front/orientation-email.ts). No migration, and cardReady keeps meaning what
// it has always meant — "is the card in hand" — for anything that reads it.
//
// The two are kept consistent by setCardState below: NA always writes cardReady
// false, so the boolean can never claim ready while the screen says not needed.

const SCOPE = "orientation";
const KEY = "card-not-needed";

/** To do / Done / Not needed — the same three the onboarding grid uses. */
export type CardFlagState = "TODO" | "DONE" | "NA";

// The click order (To do → Done → Not needed → To do) lives in the component, not
// here: this module reads prisma, so a client component must never import a VALUE
// from it. Only the type crosses over, and a type is erased at compile time.

export function isCardFlagState(v: unknown): v is CardFlagState {
  return v === "TODO" || v === "DONE" || v === "NA";
}

type NotNeededMap = Record<string, boolean>;

async function readMap(): Promise<NotNeededMap> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as NotNeededMap) : {};
  } catch {
    return {};
  }
}

/** Which of these attendees have their credit card marked "not needed". */
export async function getCardNotNeeded(attendeeIds: string[]): Promise<Set<string>> {
  if (!attendeeIds.length) return new Set();
  const map = await readMap();
  return new Set(attendeeIds.filter((id) => map[id]));
}

/** The state to show for one attendee: not-needed wins, then the boolean. */
export function cardStateFor(cardReady: boolean, notNeeded: boolean): CardFlagState {
  if (notNeeded) return "NA";
  return cardReady ? "DONE" : "TODO";
}

/**
 * Persist one attendee's card state.
 *
 * Returns the boolean to write to OrientationAttendee.cardReady, so the caller
 * makes both writes and there is one place that decides what they are.
 */
export async function setCardState(attendeeId: string, state: CardFlagState): Promise<boolean> {
  const map = await readMap();
  if (state === "NA") map[attendeeId] = true;
  else delete map[attendeeId];
  const value = JSON.stringify(map);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
  return state === "DONE";
}
