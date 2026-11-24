import type { Metadata } from "next";
import { EXEC_HUNT_TITLE } from "@/lib/exec-hunt/constants";
import { getExecHuntLiveData } from "@/lib/exec-hunt/server";
import { execHuntLogo } from "@/lib/exec-hunt/branding";
import { LiveDisplay } from "@/components/exec-hunt/LiveDisplay";

// PUBLIC - the live party display for the projector. No login so the venue's
// screen needs nobody signed in; it shows totals and (if allowed) names only.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${EXEC_HUNT_TITLE} - Live`,
  robots: { index: false, follow: false }
};

export default async function ExecHuntLivePage() {
  const [data, logo] = await Promise.all([getExecHuntLiveData(), execHuntLogo()]);
  return <LiveDisplay initial={data} logoDataUrl={logo} />;
}
