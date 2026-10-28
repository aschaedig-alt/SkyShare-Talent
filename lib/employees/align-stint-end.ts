// A person's employment periods (EmploymentStint) are what Headcount & Tenure and
// Quality of Hire count from (periodsOf, lib/data/headcount-history.ts). Correcting a
// last day elsewhere - the role editor's end date, or the termination date on the
// profile - used to leave an already-closed stint where it was, so both reports kept
// the old day. Found Oct 28 2026: Kris Carley and Larry Uzelac had their last role
// corrected to Paycom's real day, but their stints still ended on a year-end roster
// date (Dec 31 2022), so Quality of Hire went on listing them as mismatched.
//
// Only the person's LATEST stint is moved, and only when it is already closed: an
// open stint means still employed, and an earlier stint belongs to an earlier stay.
import type { Prisma } from "@/prisma/generated/client/client";

type Tx = Prisma.TransactionClient;

/** Move the end of the person's latest, already-closed stint to `lastDay`, and the
    profile's termination date with it when they are terminated. With `onlyIfEndsOn`,
    only a stint that currently ends on that day is moved. Returns whether it moved. */
export async function alignClosedStintEnd(tx: Tx, newHireId: string, lastDay: Date, onlyIfEndsOn?: Date): Promise<boolean> {
  const stint = await tx.employmentStint.findFirst({
    where: { newHireId },
    orderBy: { startDate: "desc" },
    select: { id: true, startDate: true, endDate: true }
  });
  if (!stint?.endDate || stint.startDate.getTime() > lastDay.getTime()) return false;
  if (stint.endDate.getTime() === lastDay.getTime()) return false;
  if (onlyIfEndsOn && stint.endDate.getTime() !== onlyIfEndsOn.getTime()) return false;
  await tx.employmentStint.update({ where: { id: stint.id }, data: { endDate: lastDay } });
  await tx.newHire.updateMany({ where: { id: newHireId, employmentStatus: "TERMINATED" }, data: { terminationDate: lastDay } });
  return true;
}
