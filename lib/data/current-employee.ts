/**
 * WHO COUNTS AS A CURRENT EMPLOYEE. One definition, imported everywhere.
 *
 * THIS EXISTS BECAUSE THE SAME MISTAKE WAS MADE THREE TIMES IN TWO DAYS.
 *
 * `NewHire.stage` tracks where somebody is in ONBOARDING — ACTIVE while they
 * are being onboarded, POST_ONBOARD once they finish, ARCHIVED once the
 * onboarding record is put away. It reads like an employment status and is not
 * one. Filtering on `stage IN (ACTIVE, POST_ONBOARD)` therefore selects "people
 * who joined recently", not "people who work here" — and because it returns a
 * plausible-looking subset rather than an error, nothing appears broken.
 *
 * Measured against the live database on 2026-08-01, the stage filter matched 28
 * of 173 current employees. Consequences found in three separate features:
 *
 *   - Compliments: 145 people could not be given a compliment at all, and every
 *     percentage on that page was computed against 28.
 *   - Celebrations: zero of those 28 had a birthday on file, while 63 of the
 *     wider group did, so the Birthdays list could never show anybody.
 *   - The candidate→employee lookup behind the org charts' role-change prompt
 *     matched 21 of 114 linked employees.
 *
 * The first two had already been found and fixed once each — in the new hire
 * contacts picker (2bbd293) and the celebrations query (3581e9d) — and both
 * times only the single instance in front of somebody got fixed. Hence one
 * named constant: it is greppable, and changing who counts is now one edit.
 *
 * `employmentStatus` is the field that means employed. `canceled` excludes
 * offers that never started — both are needed, since employmentStatus alone
 * would keep a cancelled hire on the list.
 *
 * NOT INCLUDED: employmentStatus "CONTRACT" (17 people as of 2026-08-01).
 * Whether a contractor belongs on a given list is a per-feature decision — see
 * CURRENT_OR_CONTRACT_WHERE below — so this constant deliberately means
 * permanent staff only, and anything wanting contractors has to say so.
 *
 * IF YOU ARE WRITING A NEW "who works here" QUERY, use one of these. If you
 * genuinely need something else, say why at the call site — lib/data/events.ts:180
 * is the example to follow, and deliberately does not use either.
 *
 * Plain object literals, not Prisma imports, so anything can read them.
 */
export const CURRENT_EMPLOYEE_WHERE = {
  employmentStatus: "ACTIVE",
  canceled: false
} as const;

/** Current staff PLUS active contractors. Use where a contractor is a
    participant rather than an employee — they are on site and doing the work,
    they are just not on payroll the same way. */
export const CURRENT_OR_CONTRACT_WHERE = {
  employmentStatus: { in: ["ACTIVE", "CONTRACT"] },
  canceled: false
} as const;
