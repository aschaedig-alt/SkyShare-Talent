import { prisma } from "@/lib/prisma";
import { findKnownPlaceByAddress, normalizePlaceText, type UsedPlace } from "./places";

// Places earlier sessions were held at, for the place picker.
//
// She said on Sep 11 that orientation moves to whatever space is free — several
// offices in SLC and Ogden, some in SVR — and only three addresses were ever
// written down. Rather than a settings screen for a list nobody will keep up,
// the picker offers every place a session has ACTUALLY been saved with: type a
// venue once, and it is one click the next time. READ ONLY — it lists what is
// on the session rows and writes nothing.
//
// Server-only (Prisma). The pure place logic the browser needs is in ./places.

export async function getUsedOrientationPlaces(): Promise<UsedPlace[]> {
  const rows = await prisma.orientationSession.findMany({
    where: { address: { not: null } },
    select: { location: true, address: true },
    orderBy: { date: "desc" },
    // Six sessions exist today. The cap only keeps a page load bounded if this
    // ever runs for years; the most recent places come first either way.
    take: 300
  });

  const seen = new Set<string>();
  const out: UsedPlace[] = [];
  for (const r of rows) {
    const address = r.address?.trim() ?? "";
    const key = normalizePlaceText(address);
    // The three known places are always in the picker already, by name.
    if (!key || seen.has(key) || findKnownPlaceByAddress(address)) continue;
    seen.add(key);
    out.push({ location: r.location?.trim() || address, address });
  }
  return out;
}
