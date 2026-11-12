---
name: paycom-status-steps
description: Decide which Paycom status steps belong in a candidate's interview history and notes history, and which are steps Aimee only clicked past in Paycom. Use whenever you record, import, clean up or audit interviews that came from Paycom invite emails (source "paycom-invite"), touch lib/paycom/interview-invites.ts or lib/paycom/status-steps.ts, run the Paycom notes scan, or someone says a Paycom step or interview "didn't happen", "shouldn't show", or is "just a status".
---

# Paycom status steps: what to include and what to leave out

## Aimee's rule (feedback cmwclez9e, 2026-11-11, her words)

> "in paycom i have to advance past some of these statuses like 'Pilot - additional interview'
> even when one isnt needed. if the interview didnt happen, i dont want to see it in the
> interview history or notes history ... generally its any without any notes."

Paycom emails an invite every time a candidate is moved into an interview step, even a step
she only moves THROUGH. The scan turns each invite into an Interview row (source
`paycom-invite`, title `<Step> (Paycom)`), which the profile shows on both the Interviews tab
and the Notes tab.

## "No note" alone is NOT enough — the calendar decides (2026-11-11, approved)

The first dry run removed every step with no note: 268 of 457. Cross-checked against the
calendars, most of those happened and simply had no note written:
- 50 had a confirmed event on the SkyShare Recruiting calendar with an interviewer who accepted
  (sims, video HM interviews, maintenance interviews with Jonathan and Rich);
- the HR screens are Calendly phone interviews on Aimee's own calendar — a spot check of
  Sep 29 to Oct 7 2025 found every one confirmed.
He was told this and approved removing ONLY the 32 steps with no note AND no calendar event.
"Ideally there are notes" — a missing note means the notes are missing, not the interview.

## The test, in order

A step recorded from a Paycom invite **stays** when any of these is true:

1. **Upcoming, or inside its grace window** (the step's Mountain date and the day after).
2. **Somebody wrote on the row in the app** — notes, write-up, outcome, rating, scorecard,
   next step, interviewer.
3. **A note or write-up from a person for that candidate on the step's Mountain date or the
   day after** — Paycom notes (`paycom-note`, as a candidate note or a write-up interview),
   `manual-writeup`, manual notes, Jazz notes or interviews. NOT evidence: `system`,
   `open-candidate-sweep`, `resume-intake`, `seed-demo`, other `paycom-invite` steps.
4. **It is an HR Interview step** — Calendly screens on Aimee's own calendar, which the app's
   service account cannot read. Always kept.
5. **A non-cancelled event on the SkyShare Recruiting calendar that day for that candidate** —
   matched by the Paycom application link in the event description
   (`.../ats/application/<id>/...`), or by the candidate's first and last name in the title.
6. **The Recruiting calendar has no events at all that month** — it cannot vouch either way,
   so the step stays. (It has none from May 2025 through Jan 2026: in those months hiring-team
   interviews were booked on Aimee's OWN calendar, aschaedig@, which the service account cannot
   read. The 62 steps in that gap were checked by hand through her Google account on Nov 11 —
   see the cleanup below. Any future check of that period has to read her calendar the same way.)
7. **The calendar could not be read** — nothing is removed.

Otherwise — no note, not an HR screen, nothing on a calendar that was in use — it is a step
she clicked past, and it is **removed**.

A write-up that arrives later is not lost: the note scan files it as its own interview
(`paycom-note`).

## The statuses

| Paycom step | What it is | Usually |
|---|---|---|
| HR Interview | Recruiter phone screen (Calendly) | always kept |
| HM Interview, Pilot -, MX -, SVR -, Support - HM Interview | Hiring-team interview | on the Recruiting calendar |
| Additional Interview, Pilot -, MX - Additional Interview | Second round — sometimes clicked past (her example) | kept only with a note or calendar event |
| Schedule HM Interview, Schedule Addl Interview, Schedule Interview, Pilot -/MX - Schedule ... | Workflow step for setting one up | often removed; kept when the calendar shows the meeting |
| Hiring Manager Review, Decision | Decision step | normally removed |

## Teya Clarke (cmqvr4jxv0cy3xcrmme9zh0d9) — the example, and why it stayed

Aimee's feedback was left on Teya's page, and her "Pilot - Additional Interview" (Nov 4 2026)
looked like the step she meant. The Recruiting calendar shows a real in-person event that day
at Ogden (Devon accepted), and Alex Andrade's Nov 6 write-up ("when we asked her...") reads as
that meeting. The rule KEPT it, and he confirmed on Nov 11: it happened; the rule was right.
The lesson: a step a person remembers as skipped can still be real — check the calendar.

## Where it lives

- Rule: `lib/paycom/status-steps.ts` (`planStatusSteps`, `fetchRecruitingCalendar`,
  `removeStatusSteps`, `restoreStatusSteps`). Change it there AND here, together.
- Command: `npx tsx scripts/paycom-status-steps.ts`
  - `--plan` — DRY RUN; writes `scripts/paycom-status-steps/review.md` and `plan.json`.
  - `--apply <plan.json> [--limit N]` — removes the plan's "remove" rows (re-checked at write
    time); undo file in `scripts/paycom-status-steps/undo/`.
  - `--sweep [--apply]` — run by the scheduled scan each pass (step 0b of
    `~/.claude/scheduled-tasks/paycom-notes-scan/SKILL.md`).
  - `--undo <file>` — puts rows back exactly, same ids (tested 2026-11-11).
- The scan only acts on Paycom emails it has not logged yet, so a removed step is not recreated.

## The 2026-11-11 cleanup

Two passes, both approved by him, 457 -> 407 invite rows (re-counted live Nov 11):
1. **32** with no note and no Recruiting-calendar event (457 -> 425). Undo:
   `scripts/paycom-status-steps/undo/steps-2026-11-11T23-37-02-974Z-batch-32.json`.
2. **18** of the 62 calendar-gap steps, checked against Aimee's own calendar (425 -> 407):
   6 were duplicate steps whose real interview is recorded on its own day, 12 never happened
   (only an HR screen on her calendar). 42 had a real interview that day and stay; Keith
   Chirico's Oct 1 step and Alex Fuentes Morales's Jan 16 screen also stay. Keith's turned out to
   be the same HM interview, rescheduled: it was moved to its real time (Oct 3 2025, 2pm MT, with
   the three interviewers named) on Nov 11, so the sweep now keeps it as written on in the app. Undo:
   `steps-2026-11-12T00-26-51-642Z-batch-3.json` and `steps-2026-11-12T00-27-09-421Z-batch-15.json`.

All undo files are in `scripts/paycom-status-steps/undo/` (gitignored, on this machine only).
Review with every group: `scripts/paycom-status-steps/review-calendar.md`.

## Rules for running it

- The database is shared and live. A bulk change beyond the scheduled sweep needs Aimee's yes
  on a dry-run review first, then a small batch, then the rest.
- Only `source "paycom-invite"` rows are ever removed. Notes and write-ups are never touched.
- Removal logs an ActivityLog entry per candidate. Quality of Hire counts COMPLETED app
  interviews, so removed steps stop counting there — intended.
