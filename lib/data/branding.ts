import { prisma } from "@/lib/prisma";

const SCOPE = "workspace";
const KEY = "branding";

/** Largest data URL we will store (a logo should be small). ~900 KB of base64 ≈ ~650 KB image. */
export const MAX_LOGO_DATA_URL_LENGTH = 900_000;

export const ALLOWED_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml"
] as const;

export type WorkspaceBranding = {
  logoDataUrl: string | null;
};

const EMPTY: WorkspaceBranding = { logoDataUrl: null };

/** Returns true when the value is a data: URL with an allowed image mime type and within the size cap. */
export function isValidLogoDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("data:")) {
    return false;
  }
  if (value.length > MAX_LOGO_DATA_URL_LENGTH) {
    return false;
  }
  const commaIndex = value.indexOf(",");
  if (commaIndex === -1) {
    return false;
  }
  const header = value.slice(5, commaIndex); // strip "data:"
  const mime = header.split(";")[0]?.toLowerCase().trim();
  return ALLOWED_LOGO_MIME_TYPES.includes(mime as (typeof ALLOWED_LOGO_MIME_TYPES)[number]);
}

export async function getWorkspaceBranding(): Promise<WorkspaceBranding> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });

  if (!setting?.valueJson) {
    return EMPTY;
  }

  try {
    const parsed = JSON.parse(setting.valueJson) as Partial<WorkspaceBranding>;
    return {
      logoDataUrl: isValidLogoDataUrl(parsed.logoDataUrl) ? parsed.logoDataUrl : null
    };
  } catch {
    return EMPTY;
  }
}

export async function saveWorkspaceBranding(branding: WorkspaceBranding): Promise<WorkspaceBranding> {
  const value: WorkspaceBranding = {
    logoDataUrl: isValidLogoDataUrl(branding.logoDataUrl) ? branding.logoDataUrl : null
  };

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(value) },
    update: { valueJson: JSON.stringify(value) }
  });

  return value;
}
