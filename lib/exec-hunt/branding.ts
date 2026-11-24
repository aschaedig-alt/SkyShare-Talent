import "server-only";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";

/** The workspace logo for the festive pages (login slot first: it is the one
 *  drawn on its own, not squeezed into the nav rail). Null = text wordmark. */
export async function execHuntLogo(): Promise<string | null> {
  try {
    const branding = await getWorkspaceBranding();
    return resolveBrandingLogo(branding, "login") ?? resolveBrandingLogo(branding, "sidebar");
  } catch {
    return null;
  }
}
