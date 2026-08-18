import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { buildDebriefQueue, resolveCalendarOwner } from "@/lib/interviews/debrief";
import { DebriefQueue } from "@/components/interviews/DebriefQueue";

/**
 * Interviews that happened on your own calendar and still have no write-up.
 *
 * Rides on the "calendar" module's access (it is a view of calendar interviews),
 * the same way /offers rides on "candidates" — see lib/navigation/modules.ts.
 */
export const dynamic = "force-dynamic";

export default async function InterviewDebriefPage() {
  await requireModulePageAccess("calendar");

  // The queue is built for WHOEVER IS SIGNED IN, from their own primary calendar.
  // That is what makes a second recruiter work later with no change here. On a
  // local machine there is no session, so resolveCalendarOwner falls back to
  // DEBRIEF_DEV_CALENDAR_EMAIL — see the safety note on that function.
  const session = await getServerSession(authOptions);
  const queue = await buildDebriefQueue({ ownerEmail: resolveCalendarOwner(session?.user?.email) });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header>
        <h1 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Debrief queue</h1>
        <p className="mt-1 text-sm text-brand-eden dark:text-slate-400">
          Interviews from your calendar that have no write-up in the app yet. The notes still live in Paycom — this
          only tracks which ones you have brought across, oldest first.
        </p>
      </header>

      <DebriefQueue queue={queue} />
    </div>
  );
}
