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
   so the step stays. (It has none from May 2025 through Jan 2026; 62 steps sit in that gap.)
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

Aimee named her "Pilot - Additional Interview" (Nov 4 2026) as a step she clicked past. The
Recruiting calendar shows a real in-person event that day at Ogden (Devon accepted), and Alex
Andrade's Nov 6 write-up ("when we asked her...") reads as that meeting. By the rule it is KEPT,
and that conflict was reported for her to look at. Do not remove it without her saying so.

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

32 removed (457 -> 425 invite rows). Undo:
`scripts/paycom-status-steps/undo/steps-2026-11-11T23-37-02-974Z-batch-32.json`.
Review with every group: `scripts/paycom-status-steps/review-calendar.md`.

## Rules for running it

- The database is shared and live. A bulk change beyond the scheduled sweep needs Aimee's yes
  on a dry-run review first, then a small batch, then the rest.
- Only `source "paycom-invite"` rows are ever removed. Notes and write-ups are never touched.
- Removal logs an ActivityLog entry per candidate. Quality of Hire counts COMPLETED app
  interviews, so removed steps stop counting there — intended.
