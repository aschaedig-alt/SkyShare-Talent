# Needs a person

Things that are built and believed correct but that **no session can verify**,
because checking them needs something a session does not have: a real phone, a
real inbox, a login that is not an admin, or a real-world event that has not
happened yet.

Asked for on 2026-09-11: *"Five things I could not verify and a person has to.
Let's have that part show up in one of my daily work reports or Monday check-in
or something, so that we can check on it after we've used it."*

It is read by the **Monday check-in** (`q3-rocks-monday-checkin`), which reports
only the OPEN items and asks about them. Not the daily work report — that one
goes to the whole HR list, and these are internal caveats rather than team news.

---

## How this file works

**Every session that writes "NOT VERIFIED" in a handoff adds the item here too.**
That is the whole point. A caveat written only into a handoff block is read once,
at commit time, by somebody who cannot act on it either — and then it is gone.
This file is where it survives until a person has actually looked.

**Only the user closes an item.** A session may not close one by reasoning about
it, by re-reading the code, or because the argument for correctness got better.
Every one of these is open precisely because argument is not the missing piece.
Move it to Closed when the user says they checked it, write what they observed,
and date it.

**An item that fails is more valuable than one that passes.** Record the failure
and open a roadmap entry for it rather than quietly deleting the row.

Status values: `OPEN` · `BLOCKED ON DEPLOY` (cannot be checked until the code is
live) · `CLOSED`.

---

## Open

### 1. A task email has never actually been sent

**Status:** OPEN
**Added:** 2026-09-11

Every checklist step that emails through Front is built, previewed and measured,
but **no message has ever gone out through it** — not a test, not a real one.
Measured 2026-09-11: the send log for this path has never been written at all. Of
the seven `WorkspaceSetting` rows in scope `front`, three are send logs and all
three are populated — `orientation-sends`, `onboarding-sends` and
`contacts-link-sends` — while `task-email-sends` is simply not there. So email
does go out of this app; it has just never gone out of **this** path.

The test send is also the shape Front has never been asked for here: from the
hrotasks channel back **to** hrotasks is a mailbox emailing itself.

**How to check it, about a minute:** open any new hire, go to the Checklist tab,
press **Send email** on a step that has one, then press **Send as test to
hrotasks@skyshare.com**. Then look in the HR Onboarding inbox in Front. The test
deliberately leaves no trace — it does not tick the step and does not write a send
record — so it is safe to do on a real person.

**What would count as a pass:** the message arrives, the greeting reads "Hi
&lt;their first name&gt;", the subject is prefixed `[TEST — would have gone to …]`,
and the links in the body are clickable.

---

### 2. Private HR notes have never been loaded by a non-HR viewer

**Status:** OPEN — the deploy it was waiting on landed 2026-09-11
**Added:** 2026-09-11

A note marked private is removed from the query rather than hidden in the page, so
it is absent from the network response and not merely invisible. That is the right
shape and it is the shape the code has. What has never happened is **somebody who
is not HR actually loading the page**: local dev bypasses auth, so every request
here runs as an admin and the non-HR branch cannot be exercised at all.

**How to check it:** have somebody with a non-HR login — a hiring manager, not
Aimee, Hannah or Kevin — open a candidate who has a private note on them, and
confirm they cannot see it. The code is live: production serves the build from
commit b06b85c, confirmed by fetching its stylesheet and finding it byte-identical
to the local build of that commit.

**What would count as a pass:** they do not see the note, and they also do not see
a gap, a count, or a "1 hidden" marker that tells them one exists.

---

### 3. The new hire vCard has never been opened on a phone

**Status:** OPEN
**Added:** 2026-09-11

The vCard route was requested for five real hires and the bytes read back, so the
file is generated and well formed. Whether a phone **does the right thing with it**
is a different question, and no phone was involved.

**How to check it:** open the contacts link on an actual iPhone and an actual
Android phone, tap a contact, and save it.

**What would count as a pass:** the contact saves with name, title, mobile and
SkyShare email on it, and the photo if one is expected.

---

### 4. The mobile feedback button has never been used on a phone

**Status:** OPEN
**Added:** 2026-09-11

Both triggers are confirmed in the served HTML with their breakpoint classes, and
the panel was measured at a 375px viewport — insets, height cap, both overflow axes
pinned, and the textarea correctly not focused on open. The part that is reasoned
rather than observed is **the iOS keyboard**: whether it covers the Send button
when the textarea takes focus.

**How to check it:** open the site on an iPhone, tap the feedback button, tap into
the box, and type.

**What would count as a pass:** the Send button is still reachable with the
keyboard up, and the panel scrolls rather than the page behind it.

---

### 5. The crew chart's last-day banner has never rendered

**Status:** OPEN, waiting on a real event
**Added:** 2026-09-11

The banner that appears once a departing crew member's last day has passed has
never been drawn, because **no departure on the live chart qualifies yet**. This
one cannot be forced without putting a fake notice date on a real person, which is
not worth doing on a shared live database.

**How to check it:** the next time somebody's last day actually passes, look at the
crew chart.

**What would count as a pass:** the banner appears on their card, and they are not
still counted as filling their seat.

---

### 6. No part of the 2026-09-11/12 overnight fix batch has been seen in dark mode

**Status:** OPEN
**Added:** 2026-09-12

79 fixes landed overnight and the dark-mode ones are the largest group. Every contrast
figure behind them is either measured by the Round 1 Chrome pass **before** the fix or
computed from the WCAG formula on specific hex pairs **after** it. Nobody has looked at the
result.

The two crew org-chart write-confirmation dialogs are the sharpest case: reaching them
requires a real production write, so Round 1 deliberately refused and Round 2 could only
reason that the fix reaches them (no createPortal anywhere in
`components/fleet/orgchart/`, and both modals render inside the `.wrap` root).

**How to check it, about two minutes:** turn dark mode on and open `/fleet/crew`,
`/fleet/maintenance`, `/reports`, `/jobs` and any page with a month calendar.

**What would count as a pass:** the org charts' "Find a person" panel is readable rather
than white-on-white; the Reports tab bar's selected tab has a visible gold ring; today's
square on a month calendar is the most obvious one rather than the least; the job-post
preview on `/jobs` is readable. Also glance at the pale-blue interview tone dot on the
crew chart - that is the one judgement call in the batch, deliberately left alone, and the
arithmetic says it was already correct.

---

### 7. The interactions behind the overnight wiring fixes were never clicked

**Status:** OPEN
**Added:** 2026-09-12

All 39 affected routes were confirmed to return 200 with real HTML and no error boundary,
so the pages render. What no session did was *use* them, and these four are behaviour
rather than markup:

- the new confirmation step before deleting a feedback item, and before deleting a travel
  receipt
- the orientation grid's send button saying **Send** rather than **Resend** on a step that
  was only hand-ticked
- "Mark onboarded" landing on the correct People tab now that the dead `?stage=`
  parameter is gone
- a linked candidate on a job opening that person's profile instead of a name search

**How to check it:** do each one once, on a real record, in the normal way.

**What would count as a pass:** the confirm appears and cancelling really cancels; the
orientation button's wording matches whether a send actually happened; the tab you land on
is the tab you expected.

---

### 8. Two code paths in the batch only run in production and cannot run here

**Status:** OPEN
**Added:** 2026-09-12

Local dev bypasses auth, so:

- The 403 rollback added to the feedback delete cannot be triggered. That route is
  `settings:admin` gated, so the restore-on-failure branch is reasoned, not run.
- The `app/page.tsx` landing-route change cannot be exercised at all. `isAuthRequired()`
  is false locally, so the function redirects before reaching the edited lines. The local
  200 on `/` is **not** evidence about that fix.

**How to check it:** after the next deploy, sign in as a non-admin and try to delete a
feedback item; and confirm the landing redirect still sends each role to the right home.

**What would count as a pass:** the non-admin is refused and the item reappears rather than
vanishing from the list; every role lands where it did before.

---

### 9. No screen reader has been used on any accessibility fix

**Status:** OPEN
**Added:** 2026-09-12

The overnight batch added accessible names to icon-only buttons, keyboard paths to
clickable divs, form labels, and a table header swap on the People onboarding grid. Every
claim is derived from the HTML and ARIA specifications - aria-label overrides
name-from-content, title is the last fallback - and not one was heard.

Two specific things were changed by reasoning and never seen rendered: the People
onboarding grid's row label became a `th` (believed visually identical, with
`font-normal` added because Tailwind's preflight has no `th` rule), and the training
table's column headers became focusable, which will now paint a gold focus ring on a header
styled by a CSS module the agent was not allowed to open.

**How to check it:** VoiceOver or NVDA on `/people` (onboarding grid) and the crew
chart's Training tab, plus Tab through both.

**What would count as a pass:** a grid cell announces the person and the task rather than
just "button"; the onboarding grid looks unchanged; the focus ring on a training header
does not look broken.

---

### 10. An interview stored in a non-Mountain timezone would now be re-read as Mountain

**Status:** OPEN, no live row affected
**Added:** 2026-09-12

The interview create and update paths now parse a naive `datetime-local` string as
Mountain wall clock instead of UTC, which is the fix. The residual: a row whose stored
`timezone` is something other than America/Denver would be re-parsed as Mountain on a
PATCH, because the edit modal sends no timezone and has no zone picker.

Measured, so the scope is known: of 350 interviews, every non-null timezone value is
America/Denver (18 seed-demo plus 2 local-calendar) and the other 330 are null. So nothing
live is wrong today.

**How to check it:** only matters if a non-Mountain interview is ever scheduled. If that
becomes real, the edit modal needs a timezone picker.

**What would count as a pass:** a non-Mountain interview survives an open-and-save
unchanged.

---


### 12. The PRD ticks have never carried over on a real move to onboarding

**Status:** OPEN — half checked
**Half closed:** 2026-09-23, by him: the test send from a real pilot candidate (Sagar Dave) passed. What is left is the carry-over below.
**Added:** 2026-09-22

The PRD section now also appears on a candidate's Checklists tab, and what is ticked there
carries onto the hire's checklist on the move into onboarding. Exercised end to end on a
TEST-tagged throwaway candidate that was then deleted: a tick was stored on the candidate,
the Request PRD Access preview built from Front and addressed the candidate's own email,
and the carry-over put the tick on a hire's PRD row with its original time. What was NOT
done: no email was sent from a candidate page (the preview was cancelled), and the carry
was run through the same function the routes call rather than through the real Move to
onboarding button.

**How to check it:** on a real pilot candidate, open Checklists, press Send email on
Request PRD Access, and use **Send as test to hrotasks@skyshare.com**. Then, the next time
a pilot moves to onboarding, look at their PRD section on the new hire page.

**What would count as a pass:** the test arrives in HR Onboarding addressed to the
candidate by first name; after the move, the PRD rows match what was set on the candidate.

---

### 13. Autosave on the hire page has not been used by a viewer without edit rights

**Status:** OPEN — deployed 2026-09-22; he will test it with a second login
**Added:** 2026-09-22

Every detail on the new hire page now saves when you leave the field, and the Save
details button is gone. Round-tripped on a real record locally (a value typed, saved,
confirmed in the database, cleared, confirmed null again). Local dev bypasses sign-in,
so the other half cannot be seen here: somebody without edit rights should find the boxes
disabled rather than typing into fields that then fail to save.

**How to check it:** sign in as a viewer who can see People but not edit it, open any
new hire.

**What would count as a pass:** the detail boxes are greyed and cannot be typed in.

---

### 14. Orientation's new time and place controls have never sent anything

**Status:** OPEN
**Added:** 2026-09-22

Change time or place, the place picker, the "different than normal" flag, the rebuilt
Update the invite preview and the edit box on the internal summary were built and read
back, and the editor was opened in a browser (the flag appears live when the time
changes). Nothing was sent and no calendar was touched, and the rewrites were tested on a
body modelled on the Front templates rather than the live ones.

**How to check it:** the next time a session is at a different time or place, change it
on the session page and open the invitation's Send window before sending.

**What would count as a pass:** the send window shows the session's own hours and place in
the body, and says "different than normal"; after Update the invite, the Google event's
title, time and location match.

---


### 16. Nobody outside HR has loaded the offer-details box, and it is the one box that holds pay

**Status:** OPEN — deployed 2026-09-22; he will test it with a second login
**Added:** 2026-09-22

The hiring manager's offer details now sit on the offer itself, so the candidate's Offers
tab and the hire's checklist show the same box. It is the ONLY place in this app allowed
to hold a pay amount — his decision on 2026-09-22, choosing the version WITH the five pay
lines over the version without. The gate is server-side in both directions: a non-HR
session is told "allowed: false" and is never sent the text.

Round-tripped locally on a real offer (typed, left the field, read back from the database,
then cleared — that application holds nothing now). What could NOT be checked here: local
dev signs everyone in as an admin with no viewer scope, so the HR gate itself has never
actually refused anybody.

**How to check it, under a minute:** sign in as somebody who is NOT on the HR team
(hrTeam false, or a role outside admin/recruiter) and open a candidate's Offers tab.

**What would count as a pass:** no "Offer details from the hiring manager" box at all —
not an empty one, not a greyed one. Then, as HR, paste a real hiring-manager message over
the thirteen lines and confirm it is still there after a reload.

---


### 18. Nothing on a job's Pilot requirement tab that SAVES has been pressed

**Status:** OPEN — deployed 2026-09-23
**Added:** 2026-09-23

Pilot Requirements is now a tab on each job, and the Role block is the one place a pilot job's
seat, aircraft, base, operator and pay text are edited - one save writes the job and its
requirement together, which is the fix for the two drifting apart. Everything was read and
checked in a browser: old links forward to the right job's tab, the Praetor 600 mismatch flag
shows, the blocks carry the right numbers, the Requirement 1 of N switcher swaps, and Save stays
disabled until a person picks which of two disagreeing values is right. What was deliberately
NOT done, on a live database: pressing any of it. Role Save, Make the requirement inactive too,
Keep it active, Set one up, Attach, the requirement editor's Save, the fleet-position save and
the moved Export CSV are typechecked only.

**How to check it, about three minutes:** on one real pilot job whose values you know are right
- say Gulfstream G200 First Officer - open Pilot requirement, press Edit role, add one word to
the end of the pay text and Save, then take the word out and Save again. (A save that changes
nothing records nothing, so retyping a value as it was proves nothing - this check said to do
exactly that until 2026-09-23.) Then open the Matchboard for that role.

**What would count as a pass:** both saves stick after a reload, two Change history rows appear
naming you with the pay text before and after, and the Matchboard role still scores the same
people.

---

### 19. Nobody without admin rights has opened the new Pilot requirement tab

**Status:** OPEN — deployed 2026-09-23 with the recruiter split; needs a login that is not an admin
**Added:** 2026-09-23

The Role block's Save - seat, aircraft, base, operator and pay text - needs jobs:write, which the
admins and the recruiter (Kevin Sherman is the only one) hold. That was his call on 2026-09-23:
"yes they should be able to but keep a history of who changed what", and every save writes a
Change history row naming who and each old and new value. Every other write on the tab - Keep it
active, Make the requirement inactive too, Set one up, Attach and the requirement editor - still
needs requirements:write, which only Aimee and Hannah hold. Local dev signs everyone in as an
admin, so what a recruiter or a viewer sees has never rendered.

**How to check it, about three minutes:** sign in as the recruiter, open a pilot job's Pilot
requirement tab, press Edit role, add one word to the end of the pay text and Save, then take the
word out and Save again. (A save that changes nothing records nothing, so retyping a value as it
was proves nothing.) Then sign in as a hiring manager or a viewer and open the same tab.

**What would count as a pass:** the recruiter sees Edit role, both saves appear in Change history
naming them with the pay text before and after, and they see no Keep it active, Make the
requirement inactive too, Set one up or Attach. The hiring manager or viewer sees everything
read-only, with no Edit role at all - not even a disabled one.

---

### 20. The Certificates tick-box editor has never been saved

**Status:** OPEN — deployed 2026-09-23
**Added:** 2026-09-23

The Certificates card in a candidate's review column is now a checklist, and its pencil opens a
tick-box editor instead of a line of text. Save (on a confirmed value) and Save & accept (on a
suggestion) write through the same metric update every other card uses, and the text the editor
writes was checked to read back as the same lines, 18 of 18. What was deliberately NOT done on a
live database: pressing either button.

**How to check it, about a minute:** on a candidate whose certificates are waiting in "to review",
press the pencil, tick or untick one box you know is right, and press Save & accept.

**What would count as a pass:** the card comes back confirmed, showing exactly the boxes you left
ticked, with its "Also seen" entries unchanged.

---

### 21. The Screening preview's Certificates block has not been seen narrow or in dark mode

**Status:** OPEN — deployed 2026-09-23
**Added:** 2026-09-23

The compact checklist in the Screening preview was seen at the width the preview had on this
machine (575px), in light mode. It is laid out for 330px, the narrowest the preview gets, and it
has dark-mode colours, but neither has rendered: the Screening tab froze Chrome's page renderer
every time it was asked to check them.

**How to check it, about a minute:** open a pilot job's Screening tab, click a candidate, narrow
the window until the preview is at its slimmest, then turn dark mode on.

**What would count as a pass:** no chip or line runs past the preview's edge, and every chip is
readable in dark mode.

---

## Closed

### 15. No trip uses Indoc & orientation yet

**Status:** CLOSED
**Closed:** 2026-09-23, by him, in two steps. The filters, sorting and CSV download passed first. The recode had not happened at that point (read back: still Orientation, last changed 2026-08-21), so it stayed half open; he then recoded Dayten Schureman’s trip himself and reported that it worked. Read back afterwards: purpose INDOC_ORIENTATION, changed 2026-09-23 16:33 UTC, so the first trip now uses the new purpose.
**Added:** 2026-09-22

Reports now has one travel report. Checked in a browser: clicking July moved the four tiles
to July ($2,722.13, "2nd-highest out of 4 months"), the request details line up, and an
empty trip shows its empty state. NOT clicked: the department, hired and purpose filters,
the column sorting, the breakdown clicks and the CSV download. No trip uses the new
Indoc & orientation purpose yet, and no real confirmation email has been read with the
changed prompt. The three trips on file as Orientation are all pilots (Dayten Schureman's
has an indoc date), so until they are recoded by hand the report counts them as HR cost.

**How to check it, about two minutes:** on Reports → Travel, pick a department, then Hired,
then sort by cost; download the CSV and open it. Recode Dayten Schureman's trip to
Indoc & orientation and look at the purpose breakdown.

**What would count as a pass:** each filter narrows the table and the tiles together, the
CSV holds exactly the rows on screen, and the recoded trip moves to its own Indoc &
orientation line.

---

### 11. The Paycom mail fix can only prove itself on the first check after it deploys

**Status:** CLOSED
**Added:** 2026-09-22

The Front mail check misread Paycom's background-check notices once names started arriving
in ordinary capitals ("Taylor Goodwin" where it used to write "TARA WARD"), ignored the legal name on
a hire's record (so "Henry Mcfarland" was reported as not a current hire although he is
Flynn McFarland), and counted text-message and requisition-posted mail as "couldn't be
read". A dry run against the live inbox, re-run at handoff, read 142 threads: 15 notices,
12 already done, 3 would-ticks — all Taylor Goodwin (information submitted twice, check
complete once) — and nothing unreadable or left alone. But a dry run ticks nothing, and the
real proof is the first real run.

**How to check it, about a minute:** after the deploy, open New hires and press **Check
Front mail** (or wait for the morning run). Then open Taylor Goodwin's checklist.

**What would count as a pass:** the dialog shows no "couldn't be read" box and no "Left
alone: Henry Mcfarland"; Taylor Goodwin's "Candidate submitted background check info" and
"Background check complete — clear to hire" are Done.

**Closed:** 2026-09-23, by him. He pressed Check Front mail on the live site after the deploy and reported a pass: nothing under couldn’t be read, no Left alone: Henry Mcfarland.

---

### 17. Nothing on the rebuilt jobs page has been SAVED through

**Status:** CLOSED
**Added:** 2026-09-22

The Recruiting Jobs page is now a card list plus a page per job with real tabs, and
EditableGrid is off it. Reading was checked hard, in a browser: tabs swap the pane with no
reload, Back works, old ?id= links land on the job's own page, and no pane has its own
scrollbar. What was NOT done, deliberately, because the database and the S3 bucket are
live: nothing was saved. Rename, department and location, the classification editor, the
Paycom req field, the Active/Inactive toggle, Add candidate, Batch add, resume intake and
New job were all left untouched. Those components are unchanged and get the same props as
before, but "unchanged" is an argument, not a test. No production build was run either.

**How to check it, about two minutes:** open one job and save one thing in each place —
rename it and change it back, toggle Active and back, save the classification, add a
Paycom req number and clear it.

**What would count as a pass:** each save sticks after a reload, and the job's card on the
list reflects it.

**Closed:** 2026-09-23, by him. He renamed the test job (Sr. Graphic Designer), toggled Active, and added and cleared a Paycom req, reloading each time, and reported a pass. Read back afterwards: the job is Sr. Graphic Designer, RETIRED, no req — exactly as it started.

---
