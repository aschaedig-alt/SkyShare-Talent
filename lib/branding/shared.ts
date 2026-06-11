// Pure branding types, constants, and helpers — NO server-only imports (no Prisma).
// Safe to import from client components. Server-side persistence lives in lib/data/branding.ts.

/** Largest data URL we will store per logo (~650 KB image). */
export const MAX_LOGO_DATA_URL_LENGTH = 900_000;
/** How many logos may live in the library. */
export const MAX_LOGOS = 12;
export const MAX_LOGO_NAME_LENGTH = 60;

export const ALLOWED_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml"
] as const;

/** Placements a logo can be assigned to. */
export const BRANDING_SLOTS = [
  { key: "sidebar", label: "Sidebar mark" },
  { key: "login", label: "Login page" },
  { key: "reports", label: "Reports / exports" }
] as const;

export type BrandingSlot = (typeof BRANDING_SLOTS)[number]["key"];

export type BrandingLogo = {
  id: string;
  name: string;
  dataUrl: string;
};

export type BrandingAssignments = Record<BrandingSlot, string | null>;

export type WorkspaceBranding = {
  logos: BrandingLogo[];
  assignments: BrandingAssignments;
};

const EMPTY_ASSIGNMENTS: BrandingAssignments = { sidebar: null, login: null, reports: null };

export function emptyBranding(): WorkspaceBranding {
  return { logos: [], assignments: { ...EMPTY_ASSIGNMENTS } };
}

function makeId(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `logo_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** True when the value is a data: URL with an allowed image mime type and within the size cap. */
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

function normalizeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim().slice(0, MAX_LOGO_NAME_LENGTH);
  return trimmed || fallback;
}

export function normalizeBranding(value: unknown): WorkspaceBranding {
  if (!value || typeof value !== "object") {
    return emptyBranding();
  }

  const raw = value as {
    logoDataUrl?: unknown;
    logos?: unknown;
    assignments?: unknown;
  };

  // Migrate the old single-logo format ({ logoDataUrl }).
  if (typeof raw.logoDataUrl === "string" && isValidLogoDataUrl(raw.logoDataUrl)) {
    const id = makeId();
    return {
      logos: [{ id, name: "Logo", dataUrl: raw.logoDataUrl }],
      assignments: { ...EMPTY_ASSIGNMENTS, sidebar: id }
    };
  }

  const logos: BrandingLogo[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(raw.logos)) {
    for (const entry of raw.logos) {
      if (logos.length >= MAX_LOGOS) {
        break;
      }
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const candidate = entry as Partial<BrandingLogo>;
      if (!isValidLogoDataUrl(candidate.dataUrl)) {
        continue;
      }
      let id = typeof candidate.id === "string" && candidate.id ? candidate.id : makeId();
      while (seenIds.has(id)) {
        id = makeId();
      }
      seenIds.add(id);
      logos.push({
        id,
        name: normalizeName(candidate.name, `Logo ${logos.length + 1}`),
        dataUrl: candidate.dataUrl as string
      });
    }
  }

  const assignments: BrandingAssignments = { ...EMPTY_ASSIGNMENTS };
  const rawAssignments =
    raw.assignments && typeof raw.assignments === "object" ? (raw.assignments as Record<string, unknown>) : {};
  for (const slot of BRANDING_SLOTS) {
    const assigned = rawAssignments[slot.key];
    assignments[slot.key] = typeof assigned === "string" && seenIds.has(assigned) ? assigned : null;
  }

  return { logos, assignments };
}

/** Returns the data URL assigned to a placement, or null. */
export function resolveBrandingLogo(branding: WorkspaceBranding, slot: BrandingSlot): string | null {
  const id = branding.assignments[slot];
  if (!id) {
    return null;
  }
  return branding.logos.find((logo) => logo.id === id)?.dataUrl ?? null;
}
