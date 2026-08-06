/**
 * Candidate list sizing — plain constants, NO imports.
 *
 * These live apart from lib/data/candidates.ts on purpose. That module imports
 * lib/prisma, so a CLIENT component importing a constant from it pulls the
 * Postgres driver into the browser bundle and the page dies at build time with
 * "Can't resolve 'fs'" from pg-connection-string — an error that names neither
 * the constant nor the component that caused it. The filter controls are client
 * components and need these numbers, so the numbers cannot live next to Prisma.
 */

/**
 * The default page size. The list is capped rather than paged, so anything
 * beyond this is reachable by searching — but the UI must SAY it is showing a
 * subset, or the page reads as "the rest of my candidates vanished".
 */
export const CANDIDATE_LIST_LIMIT = 100;

/**
 * Page sizes the UI offers, and the hard ceiling.
 *
 * 500 exists because sorting ~3,600 candidates into departments by hand at 100
 * a page is the actual job somebody is doing. It is a real cost — 500 rows each
 * carry tags and application departments — so it is opt-in per load, never the
 * default, and the ceiling stops a hand-edited ?size= from asking for all of it.
 */
export const CANDIDATE_PAGE_SIZES = [100, 250, 500] as const;
export const CANDIDATE_LIST_MAX = 500;
