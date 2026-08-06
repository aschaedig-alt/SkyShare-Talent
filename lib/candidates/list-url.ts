import { CANDIDATE_LIST_LIMIT } from "@/lib/candidates/list-config";

/**
 * Build the /candidates URL from the full filter state.
 *
 * Every filter control on that page rebuilds the query string, and each one used
 * to construct it from only the params it knew about — so adding the department
 * filter and the page size would have made picking a tag silently drop them.
 * One builder, so a control can only ever change its own parameter.
 */
export function buildCandidatesHref(state: {
  query?: string;
  tags?: string[];
  departments?: string[];
  size?: number;
}): string {
  const params = new URLSearchParams();
  if (state.query?.trim()) params.set("q", state.query.trim());
  if (state.tags?.length) params.set("tags", state.tags.join(","));
  if (state.departments?.length) params.set("depts", state.departments.join(","));
  if (state.size && state.size !== CANDIDATE_LIST_LIMIT) params.set("size", String(state.size));
  const qs = params.toString();
  return qs ? `/candidates?${qs}` : "/candidates";
}

/** ?tags=Hot+lead,Veteran / ?depts=maintenance,fbo — comma-separated so a filtered view survives a copied URL. */
export function parseListParam(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))];
}
