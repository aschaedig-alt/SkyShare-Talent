// How a source spelling becomes a lookup key, and what an unmapped one might be.
// PURE - no database - so the Paycom loader, the Reports > Sources page and the
// candidate profile all key spellings the same way.
//
// Asked for 2026-09-29: "we need to be able to audit the list of sources incase
// someone types one wrong for example BizJetJobs.com could be listed as just
// bizjet and its the same place." The key absorbs differences that are never a
// different place (case, spacing, "www.", ".com"); a real difference like "bizjet"
// is mapped ONCE by a person, in SourceAlias, and the original spelling stays on
// the record it came in on.

/**
 * A spelling's key. Case, spaces, punctuation, "http(s)://", "www.", a trailing
 * "/" or ".com", and the link-shim prefixes social sites put on a referrer
 * ("l.instagram", "m.facebook") never make a different place: "BizJetJobs.com",
 * "bizjetjobs", "Biz Jet Jobs" and "www.bizjetjobs.com/" share one key, as do
 * "Walk-in" and "Walk In". Letters and digits only. Null for a blank.
 */
export function sourceKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.toLowerCase().trim();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  s = s.replace(/^(?:l|m|lm)\.(?=[a-z])/, "");
  s = s.replace(/\.com$/, "");
  s = s.replace(/[^a-z0-9]/g, "");
  return s || null;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * For a spelling nobody has mapped yet: the tidy name it most likely means -
 * "bizjet" -> BizJetJobs, because a known spelling starts with it. Only a
 * suggestion: the page shows it and a person confirms it. Null when nothing
 * known is close, or the spelling is too short to judge (3 letters or fewer).
 */
export function suggestCanonical(key: string, known: Array<{ key: string; canonical: string }>): string | null {
  const k = squash(key);
  if (k.length <= 3) return null;
  let best: { canonical: string; overlap: number } | null = null;
  for (const m of known) {
    for (const candidate of [squash(m.key), squash(m.canonical)]) {
      if (candidate.length <= 3) continue;
      const hit = candidate === k || candidate.startsWith(k) || k.startsWith(candidate) || (k.length >= 6 && candidate.includes(k));
      if (!hit) continue;
      const overlap = Math.min(candidate.length, k.length);
      if (!best || overlap > best.overlap) best = { canonical: m.canonical, overlap };
    }
  }
  return best?.canonical ?? null;
}
