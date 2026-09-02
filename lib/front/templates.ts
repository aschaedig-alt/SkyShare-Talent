import { frontFetch, paginate } from "./client";

// Listing Front's message templates, so a checklist task can be pointed at one
// from inside the app instead of somebody pasting an rsp_ id into a source file.
//
// HR maintains ~50 templates in Front and edits them there. This only ever READS
// the list — nothing here creates, renames or deletes a template, and the token
// carries no Delete scope anyway (see .claude/skills/front-api).

export type FrontTemplateSummary = { id: string; name: string; subject: string };

type FrontTemplate = { id: string; name?: string; subject?: string; body?: string };

/**
 * Every template the token can see, by name.
 *
 * Paginated to exhaustion rather than reading the first page: the list is around
 * fifty and Front's default page is smaller than that, so a single GET would have
 * quietly hidden the templates whose names sort late — which is precisely the
 * failure that looks like "that template does not exist in Front".
 */
export async function listTemplates(): Promise<FrontTemplateSummary[]> {
  const out: FrontTemplateSummary[] = [];
  for await (const t of paginate<FrontTemplate>("/message_templates")) {
    if (!t?.id) continue;
    out.push({ id: t.id, name: t.name?.trim() || t.id, subject: t.subject?.trim() ?? "" });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
  return out;
}

/**
 * Fetch one template by id, falling back to a name match.
 *
 * The fallback is not decoration: rebuilding a template in Front gives it a NEW
 * id, and the stored id then 404s. Matching the remembered name recovers from
 * that without a code change — the same trick fetchTemplate() in
 * lib/front/orientation-email.ts uses, for the same reason.
 */
export async function fetchTemplate(id: string, rememberedName?: string): Promise<{ id: string; name: string; subject: string; body: string }> {
  try {
    const t = await frontFetch<FrontTemplate>(`/message_templates/${id}`);
    return { id: t.id, name: t.name?.trim() || id, subject: t.subject ?? "", body: t.body ?? "" };
  } catch (err) {
    if (!rememberedName?.trim()) throw err;
    for await (const t of paginate<FrontTemplate>("/message_templates")) {
      if (t?.name?.trim() === rememberedName.trim()) {
        return { id: t.id, name: t.name.trim(), subject: t.subject ?? "", body: t.body ?? "" };
      }
    }
    throw new Error(
      `The Front template "${rememberedName}" is gone — it was deleted or renamed. Pick it again in Manage tasks.`
    );
  }
}
