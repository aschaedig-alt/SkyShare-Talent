/**
 * The current URL with ONE parameter changed and everything else kept.
 *
 * REPLACED a builder that took the whole filter state as named arguments. Every
 * control called it with the parameters it happened to know about, so each new
 * filter broke the ones written before it: ?bucket= and ?across= were added
 * after the tag, department and page-size controls, and none of the three was
 * updated — narrowing by department while standing on "Talent pool" threw you
 * back to Everyone. The builder is gone rather than fixed, because the next
 * filter would have done it again.
 *
 * This starts from what is actually in the address bar, so a control can only
 * ever change its own key and a parameter added later cannot be lost by a
 * control that has never heard of it.
 *
 * Pass null or an empty array to remove the parameter.
 */
export function hrefWithParam(
  current: URLSearchParams | ReadonlyURLSearchParamsLike,
  key: string,
  value: string | string[] | number | null
): string {
  const params = new URLSearchParams(current.toString());
  const empty =
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

  if (empty) params.delete(key);
  else params.set(key, Array.isArray(value) ? value.join(",") : String(value));

  const qs = params.toString();
  return qs ? `/candidates?${qs}` : "/candidates";
}

/** Structural type so this stays usable with Next's ReadonlyURLSearchParams. */
type ReadonlyURLSearchParamsLike = { toString(): string };

/** ?bucket=all, for the links. Defined and explained in view-preference.ts. */
export { BUCKET_ALL_PARAM as BUCKET_ALL } from "@/lib/candidates/view-preference";

/** ?tags=Hot+lead,Veteran / ?depts=maintenance,fbo — comma-separated so a filtered view survives a copied URL. */
export function parseListParam(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))];
}
