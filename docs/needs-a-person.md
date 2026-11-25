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

**Status:** BLOCKED ON DEPLOY - all passed 2026-11-21 except the /jobs preview, fixed that day
**Added:** 2026-09-12

**Sweep 2026-11-21:** Checked on the live site in dark mode (contrast scan on every text node, plus screenshots): Crew chart Find a person panel readable; Reports selected tab has its gold ring; today's square (21) on the month calendar is the gold one; Maintenance chart nothing under 3:1. FAILED: the job-post preview on /jobs - its Job Summary paragraph was light grey on the white preview paper (1.48:1). Fixed in components/job-preview/FormattedJobPost.tsx, BLOCKED ON DEPLOY. Also seen: the 7.5px Assistant Chief Pilot label on the crew chart is 2.4:1 in dark mode.

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

**Sweep 2026-11-21:** Read-only DB: no candidate has any PRD tick stored (preHireTasksJson null on all), so a carry-over cannot have happened yet.

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

**Sweep 2026-11-21:** No account today has People without editing it (the three hiring managers have no People area; checked by View as), so this cannot happen with the current team. It stays open only for the day such an account exists.

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


### 19. Nobody without admin rights has opened the new Pilot requirement tab

**Status:** OPEN — deployed 2026-09-23 with the recruiter split; needs a login that is not an admin
**Added:** 2026-09-23

**Sweep 2026-11-21:** Viewer half PASSED (View as Alex Andrade: Pilot requirement tab read-only, no Edit role, no Keep it active / Set one up / Attach). Recruiter half: View as Kevin Sherman shows Edit role and none of the four requirement writes; he also sees Edit requirement, Active/Inactive and Add aircraft, which is the later deliberate canEditScoring grant (fleet position and managed aircraft). The save itself was proven as Aimee in #18. Left: Kevin saving once himself.

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

### 23. No Pilot Application has arrived since search started reading them by layout

**Status:** OPEN — deployed 2026-09-23 with 6b70f75, confirmed live; waits on a Pilot Application arriving
**Added:** 2026-09-23

**Sweep 2026-11-21:** Stored side PASSED: 43 Pilot Applications have arrived since Sep 23 (newest Jonathan Gleisberg Nov 18, Gaurav Lachhwani Nov 11), every one with searchText and none containing "NAME:". Left: searching one in the UI.

Search reads a signed Pilot Application by its answers - read by layout, the form's printed
labels left out, and the "position applying for" line counted as a job applied to. The 1,300
already on file were filled in on 2026-09-23. A new one gets the same when it arrives through
Front, a profile upload or Upload documents - but none has arrived since, so that path has not
run on a real file.

**How to check it, about a minute:** once a new pilot applicant arrives, search their name.

**What would count as a pass:** their row's match line reads "Pilot application" followed by
their answers - no "NAME:" or "PHONE:" labels - and a search for the aircraft they applied for,
with Experience only, does not find them unless their resume or flight data mentions it.

---

### 24. Nobody has taken anyone off an orientation's Google invite yet

**Status:** OPEN — deployed 2026-09-29
**Added:** 2026-09-29

Removing or moving an attendee now asks who should come off the session's Google Calendar
invite (the hire, and each of their supervisors - kept by default if they supervise somebody
still on the session), and the calendar panel lists anybody still on the invite who is no
longer on the session (their own supervisors excepted). It all runs on the SIGNED-IN person's own Google access, which local
dev does not have, so no invite was changed while it was built.

**How to check it, about three minutes, signed in with Google on the live site:** open the Sep 29
session. Its calendar panel should list Sam Jaffari under "On the invite, but not on this
session" - press "Take off the invite", then look at the event in Google Calendar.

**What would count as a pass:** Sam is gone from the event's guest list, nobody else changed,
and no email went to Sam - removal is silent by his choice (Sep 29).

---

### 25. No 30-day check-in has been skipped yet

**Status:** OPEN — deployed 2026-09-29
**Added:** 2026-09-29

The post-onboarding grid's check-in email now has "Skip - don't send" in its dialog; the cell
then reads "Skipped" (who and when on hover) instead of DUE, and one click undoes it. Skipping
writes the step as N/A plus a small record of who skipped it, so it was not pressed on real
people while it was built.

**How to check it, about a minute:** skip one person's 30-day check-in, hover the cell, then
undo it.

**What would count as a pass:** the cell reads Skipped with your name and today's date, the
person drops out of "Outstanding check-ins only", and after undo the cell is back as it was.

---

### 26. No reminder email has been set up or sent yet

**Status:** OPEN — deployed 2026-09-29
**Added:** 2026-09-29

A step's email can now be marked "reminder to somebody else": sending it never ticks the step,
and the checklist grid shows an envelope on each person still to do. Templates can carry
{{name}}, {{first_name}}, {{position}}, {{start_date}} and {{orientation_date}}. Needs a Front
template and the accounting / compliance addresses, which only Aimee has.

**How to check it, about five minutes:** write the reminder template in Front using {{name}};
on the grid, Manage tasks -> Email on "Received company credit card": pick it, Send to
"Addresses I type in below" with the accounting address, tick the reminder box, save. Then use
a pilot's envelope on that row and send.

**What would count as a pass:** accounting gets the email with the pilot's name filled in, and
the grid still shows that pilot's card as to do, with the envelope now offering "Resend".

---

### 27. The orientation grid's card and iPad circles now write the hire's checklist

**Status:** OPEN — deployed 2026-09-29
**Added:** 2026-09-29

On an orientation session the CREDIT CARD and IPAD columns now show the hire's own checklist
steps (N/A shows as a dash) and a click saves to that checklist too. The TRAVEL select gained
Remote, and only orientation trips count toward the session's travel and spend. Displaying was
checked against the Sep 29 session; clicking was not, because every click writes a live
checklist.

**How to check it, about two minutes:** on an upcoming session, tick someone's credit card,
then open their checklist from their name. Set somebody's travel to Remote.

**What would count as a pass:** the checklist shows "Received company credit card" done, and
the Remote person no longer counts in "Out-of-town", "Travel booked" or "Travel spend".

---

### 29. The unarmed-orientation warning has never appeared on a screen

**Status:** OPEN
**Added:** 2026-10-25

The reminder health check can now report an UPCOMING session that nobody has turned
"Send it automatically" on for. That was the one failure shape it could not see, and it is
the shape that hid the 29 Sep session in September: the check starts from the armed list,
so a session nobody armed produced no output at all.

**Nobody has seen it fire.** It cannot be made to fire against the live table today, and
that is by design rather than luck: there is no future orientation session, and the stale
29 Sep row is excluded on three separate gates (its day has passed, it is armed, and every
attendee already has the reminder recorded). Measured today: zero warnings. So the logic is
replayed and arithmetic-checked, and the red box itself has never been drawn.

**Two things are reasoned rather than observed:**

- The wording and the placement. The warning goes in the global `problems` list, so it
  appears on *every* orientation session page with attendees, including sessions it is not
  about. That is deliberate - the session nobody armed is the session nobody opens - but it
  is also the shape of a bug this file previously fixed, and nobody has looked at how it
  reads when it names a session other than the one in front of you.
- That it clears. It should disappear the moment the session is armed, and again once the
  session day passes. Both are gates in the code; neither has been watched.

**How to check it:** the next time an orientation session is created, add an attendee and
leave "Send it automatically" off. Four days before the session a red box should appear on
the orientation pages. Turn it on and it should vanish.

**What would count as a pass:** the box appears about four days out, names the right session
with its date and time, reads sensibly when you are looking at a different session, and
clears as soon as the session is armed.

**Also still open, deliberately, and it is a decision rather than a check:** un-arming a
session currently DELETES its entry, so "we decided to send this one by hand" is stored
identically to "nobody ever looked". That means choosing the supported manual path still
raises the warning. Storing false instead of deleting would fix it in two lines, and the
three readers all use truthy filters so a stored false would be invisible to the cron and
to the checkbox - but it changes the shape of a row the unattended send depends on, so it
wants a yes from the user rather than an agent's judgement.

### 30. No Paycom applicant upload has been undone yet

**Status:** OPEN — upload and import passed on the live site 2026-10-25 (him); Undo never run
**Added:** 2026-10-25

**Narrowed 2026-10-25, by him:** he ran the whole October upload on the live site and
reported "i ran it, it worked." Read back from the live database afterwards: batch
cmvokyco3000008kxveowrsly COMPLETED (19:30 to 19:37 MT), 103 of 103 applications
IMPORTED, 53 people created, 6 retired jobs reopened and 2 jobs created (both as the
preview said), 200 PDFs filed — 206 less the 6 resumes identical to one already on that
person's profile, which are deliberately not filed twice (6 rows carry that note). He ran
the full import directly rather than the one-application test below, so **Undo has still
never run**. Do NOT test Undo on this batch: it would take the real October import back
out. It waits on the next upload that can safely be undone (a small one, or a mistaken
one). The rest of this item, below, is the original text.

Imports > Paycom applicants takes Paycom's two document zips and files every application:
it splits the bundle, matches or creates the candidate, links or creates the job, attaches
the application PDF and the resume. **Only the read-only half has been run.** The preview
was run against the live database with the October 2026 export (103 applications) and
the PDF split was checked offline (460 pages in, 460 out, each piece holding only its own
Application ID and name). **Import and Undo have never written anything for real** (true until his run on 2026-10-25; Undo still is), because
testing them would put real applicants into the shared live database.

**The upload itself failed on the live site the first time (2026-10-25, "Failed to
fetch")** — the first version sent the zips straight from the browser to S3, and the
bucket has no CORS rule, so S3 refused it. It now sends them through the app in 3 MB
parts. That path was run end to end against the local server with the October zips
(5 parts, then a preview of all 103), but **not yet on the live site** (it has been since: his run, 2026-10-25, above).

**How to check it:** open the page, drop both zips, press Upload and preview. Use Select
none, tick ONE application, Import. Open that person's profile: the application has the
right job and date, and both PDFs open. Then Undo the upload from Recent uploads and check
the application and PDFs are gone (and, if the person was new, the person too). Then
upload again and import the rest.

**What would count as a pass:** the one application lands correctly, Undo removes exactly
what it added, and the full import afterwards matches what the preview said.

### 31. No Paycom employee upload has applied a change or been undone yet

**Status:** OPEN — upload, preview and recording the starting point passed on the live site 2026-10-26 (him); applying a change and Undo never run
**Added:** 2026-10-25

**Narrowed 2026-10-26, by him:** he uploaded the Oct 16 export on the live site after the
fix and reported "i ran the employee upload on the live site and the preview worked."
Read back from the live database: batch cmvpbxjfa000007gqjtmjgtgr COMPLETED (08:05 to
08:07 MT), preview 322 rows / 320 matched / 309 agree / 0 changes / 11 for a person / 2 not
matched - exactly the dry run - and recorded as the position starting point with 0 people
changed. That covers the first two steps of the check below. What is left waits on the
NEXT Paycom export: apply ONE change it shows, check that person, Undo, check them again.
The rest of this item, below, is the original text.

Imports > Paycom employees takes Paycom's Advanced Report Writer employee export and keeps
the Employees directory current: terminations, re-hires, date corrections, full / part
time and position changes. **Only the read-only half has been run** (as of 2026-10-25; see above for 2026-10-26): the preview against
the live database with the Oct 16 export, which the CLI scripts had already applied, and it
came back with 0 changes, as it should. **Apply and Undo have never written anything for
real.** The re-hire path and the position comparison were only checked in memory - the Oct
16 file has nobody to re-hire, and positions have no baseline until one upload is applied.
The page's file upload has not been clicked through in a browser either (until
2026-10-25: his first upload on the live site failed with "Cannot read properties of
undefined (reading 'read')" - the site loads a build of the spreadsheet library the
terminal scripts never did. Fixed in d9ab68a; his upload after the fix worked, 2026-10-26, above).

**How to check it:** open the page, drop the Oct 16 export, Upload and preview. It should
show 0 changes, 11 for a person, 2 not matched. Press "Record this export (no changes)" -
that makes it the position baseline. When the next export arrives, upload it: any re-hire,
termination or position change it shows, apply ONE, open that person's profile and check
the employment dates, status and role, then Undo from Recent uploads and check they are back.

**What would count as a pass:** the one person changes exactly as the preview said, and
Undo puts them back exactly as they were.

### 34. Which Paycom reports hold separation reasons and the employee census is unconfirmed

**Status:** OPEN
**Added:** 2026-10-27

The Quality of Hire baseline (scripts/qoh/qoh-baseline.cjs) leaves voluntary or
involuntary, termination reason and rehire eligibility blank for all 276 hires who have
left, because Journey does not store them. The plan is to join a Paycom separation report
and the employee census onto the hires file by Employee Code, else legal name plus hire
date. **Nobody here can see Paycom**, so the report names and their columns are a guess.

**How to check it:** in Paycom, find the report that lists terminations with their reason,
voluntary or involuntary, and rehire eligibility, and the one that lists every employee
with their Employee Code, legal name and hire date. Export one of each.

**What would count as a pass:** both exports exist and carry those columns, so the join
can be built on a real file.

**Update 2026-10-27 (commit agent, checked against the file):** the separation report has
arrived — Paycom's Employee Turnover Report, tab "Terminated Employee Details" (EE Code,
Name, Company Location, Department, Term Date, Term Type, Term Reason, Hire Date, Rehire
Date), 168 rows. It carries Employee Code, name and hire date itself, and every row
matched a Journey hire, so a separate census export turned out not to be needed. What it
does **not** carry is rehire eligibility: there is no such column, and Rehire Date reads
00/00/0000 on all 168 rows. Term Type is blank on every exit before 2025, which HR is
filling in by hand (a sheet of 102 people). Left OPEN for you to close: the remaining
question is whether Paycom holds rehire eligibility anywhere, or whether it is dropped.

---

### 35. The Quality of Hire tab has not been clicked, and its uploads have never been saved or undone

**Status:** OPEN
**Added:** 2026-10-27

The Quality of Hire tab on Data > Reports (commit 08d13dc) was checked by rendering it
on the server and by previewing each upload over HTTP. Nobody has opened it in a browser
and clicked through it, and **Save and Undo have never been pressed**, because both write
the live database. Until the three files are saved, the tab shows no exit reasons and
almost no interviews.

**How to check it:** as an admin, open Data > Reports > Hire quality (/reports/hiring/quality; was the Quality of Hire tab until 6c7f034). In Update the
data, upload Paycom's terminations report (.xlsx), HR's term-type sheet (.csv) and the
calendar interview file (.csv): preview each, then Save. Confirm the tab now shows exit
reasons and interviews (about 190 of 274 hires with one or more). Then press Undo on one
upload and confirm the tab goes back, and Save it again.

**What would count as a pass:** the tab renders for an admin and not for anyone else; all
three files save; Undo puts the report back as it was; Save again restores it.

---

### 36. No offer step has filled its Offer sent / Offer signed date on its own yet

**Status:** OPEN (deployed 2026-10-30, bee8ebc)
**Added:** 2026-10-30

**Sweep 2026-11-21:** Read-only DB: every offer date set since Oct 30 equals the Mountain day of its tick (Teya Clarke, Steve Cox, Matt Smith, both Logros), and Jake Aoki's earlier typed Offer sent (Nov 16) was left alone - consistent, but nothing records that the auto-fill wrote them. Paycom mail IS reaching HR Onboarding (Front: "Pending Offer Approval" Nov 20, "Final Review of New Hire Onboarding" Nov 20). Still unproven: an Offer Accepted notice filling Offer signed - Teya (Nov 10) and Steve Cox (Nov 19) still read sweep-pending in the Paycom log.

Ticking "Offer letter sent to candidate" or "Candidate signed offer letter" now fills the
hire's Offer sent / Offer signed date when that field is blank, and Paycom's "Offer
Accepted" notice fills Offer signed with the day it arrived. Paycom's subjects also stopped
reading since they gained an "[EXTERNAL] " prefix, which is fixed. The parser was checked
against the real Oct 28-30 notices with nothing written. **No tick has been made through
the new code**, because it writes the live database.

Separately, as of 12:59pm on Oct 30, **no Paycom email had reached Front since 6:21pm on
Oct 29**, while two did reach Aimee's Gmail (11:03am and 11:28am Oct 30) and Front itself
was receiving other mail. Until that flow resumes the sweep has nothing to read.

**How to check it:** on the next new hire, tick "Offer letter sent to candidate" on the
onboarding checklist with Offer sent blank, then reload and look at Identity & dates. When
their "Offer Accepted" email arrives, wait for the next Paycom check and look at Offer
signed. Also confirm a Paycom email from Oct 30 or later shows in Front's HR Onboarding inbox.

**What would count as a pass:** both dates appear on their own with the right day, a date
you typed yourself is never changed, and Paycom mail is showing up in HR Onboarding again.

### 37. Nobody has saved a note since blank lines started surviving the save

**Status:** OPEN (deployed 2026-10-30, aa436e5)
**Added:** 2026-11-03 — owed since Oct 30; the handoff said NOT VERIFIED and this entry was missed

Feedback cmvpxe5xt: a blank line showed while editing a note and vanished once it was saved.
The cause was a line break left stranded at the end of a paragraph, which the editor draws
as a blank line and a normal page does not. It is now turned into a real blank line on
save, when the editor opens a note, and when a saved note is shown, so older notes show
their blank lines without being re-saved. Checked on Oct 30 with nothing written: all 81
stored notes keep their text and bullets, and on Teya Clarke's Jan 10 interview pressing
Enter before a question produced a real blank line that the saved view draws at full
height. **No note has been saved through the new code**, because a save writes the live
database. This replaces item 32, which was closed on Oct 26 as superseded by this bug.

**How to check it:** open any interview write-up or candidate note, press Enter twice
between two lines to leave a blank line, add a bullet and an indented bullet under it,
then save. Reopen it with Edit, then Cancel.

**What would count as a pass:** the saved note shows the blank line, the bullet and the
indented bullet exactly as they looked while editing, and reopening it shows the same
again.

### 38. Nobody has dragged an aircraft card with a mouse or saved the crew chart since it became draggable

**Status:** OPEN (deployed 2026-11-03, 2addb48)
**Added:** 2026-11-03

Feedback cmw13sa9s: in Edit all on Fleet → Crew, aircraft cards can now be dragged to
reorder them or dropped into the other section to move them between Fractional and
Managed, and the Chief Pilot and assistant boxes became text boxes saved with the chart.
Checked on Nov 3 in Chrome against the real roster with every save blocked: the Challenger
350 (N522AD) moved from Fractional into Managed between the Legacy 650 and the 560 XLS+,
a reorder and a drop at a section's end worked, a shared-pool tail was refused from
Fractional, and typing in a leadership box kept focus. **The drags were simulated drag
events, not a hand on a mouse, and nothing was saved**, because Save rewrites the one
shared roster everybody sees.

**How to check it:** on Fleet → Crew press Edit all, drag the Challenger 350 card down
into Managed / Dedicated Aircraft and drop it where it belongs by size, add its owner
on the card if it has one, then Save changes and reload the page.

**What would count as a pass:** after the reload the Challenger 350 is under Managed in
the place you dropped it, Fractional shows 5 aircraft, nothing else on the chart moved,
and the Chief Pilot box reads Cameron Morgan.

### 40. The Paycom notes scan has never hit a Paycom sign-out, and its alert may not reach a phone

**Status:** OPEN
**Added:** 2026-11-06

The "Paycom notes scan" scheduled task (Claude desktop app, weekdays every 2 hours plus Run
now) copies the notes on every Paycom application that mentions Aimee into the app. Its first
live run worked through Chrome while Paycom was signed in, and the filing, the typo pass and
the Front "Notes Auto Added" tag were each checked against the live data that day.

**Two things have not been seen:**

- **The signed-out path.** Paycom never timed out during a run, so the stop-and-alert step
  ("Paycom signed out — N mention(s) waiting…") has never fired for real.
- **Whether the alert reaches anyone away from the desk.** On the first run a notification was
  sent and reported as not reaching the phone, because Remote Control was not connected. A
  desktop notification still shows on the computer, but nothing arrives on the phone unless
  Remote Control is on.

**How to check it:** the next time Paycom has signed out on its own, click Run now on the task.

**What would count as a pass:** the run stops without touching the login form, a notification
appears (on the phone too, if that matters), and after signing in a second Run now files the
waiting mentions.

---

### 42. Nobody has clicked "Report to a role" or changed a leadership role holder yet

**Status:** OPEN
**Added:** 2026-11-10

**Sweep 2026-11-21:** Live site: People > Leadership roles shows Cameron Morgan (85 report to it) and Alex Andrade (84). Russ Herman's profile read "Chief Pilot · follows the role"; Unlink, then Link a supervisor > Chief Pilot, saved (DB: supervisorRoleKey chief-pilot, updated 22:01Z) and reads the same after reload. Found and fixed: the page then wrongly warned "Leave site?" (components/people/NewHireDetailWorkspace.tsx), and the Unlink button went white-on-white on hover in dark mode (SupervisorPicker.tsx). Left: a real holder change.

Supervisor slots can now follow a role: Chief Pilot (Cameron Morgan) and Assistant Chief
Pilot (Alex Andrade). 77 current pilots were moved onto those roles in the live database
and read back. The pages returned 200 locally, and saves were tested by direct request:
an unchanged save keeps the role, and a holder cannot report to their own role. But
nobody has clicked through the picker or the People > Leadership roles page in a
browser, and no holder has been changed for real.

**How to check it:**

- Open a pilot's profile. Under Supervisor it should say "Chief Pilot · follows the role"
  above Cameron Morgan. Click Unlink, then Link a supervisor, then pick Chief Pilot under
  "Report to a role". It should come back the same.
- Open /people/leadership-roles. Both roles should show their holder and a count of
  people who report to them. Do not change a holder just to test it, since that
  re-points about 77 people at once. Wait for a real change, such as filling the
  Assistant Director of Training role or the next handover.

**What would count as a pass:** the profile shows the role and its holder, re-picking the
role sticks after a reload, and a real holder change updates every follower's supervisor
(the page says how many).

---

### 44. Nobody has saved a 90-day check-in rating yet, and the People page would not come alive locally to click it

**Status:** OPEN - three of four passed. His second live test 2026-11-11, after the due
list got its own Rate button (5490627): he rated Jonathan Siswick from it and the rating
showed in the Values column after a reload (commit agent read it back: would hire again yes, no
core values rated, so the column has no average to show yet), and Jonathan left the due list (the database holds that
one rating). NOT passed: ticking a 90-day check-in done and using "Mark done without a
rating" - he did not see that option. It appears only when the form is opened from the
90-day column on People > Post-onboard (the circle or the red DUE), not from Rate; not yet
known whether he opened it that way. Also found: a rating saved from Rate does not tick the
90-day check-in (Jonathan's is still TODO).
UPDATE 2026-11-12 (commit agent): the Jonathan Siswick rating was only his test and was deleted at
his request; his 90-day check-in stays open on purpose. The one rating now on file is Axel Leimer's,
saved 2026-11-12 through the emailed rating link (entered by "Rating link (Jonathan Schaedig)").
**Added:** 2026-11-10

**Sweep 2026-11-21:** 21 ratings are now on file (13 at 90 days, 8 at 6 months), all through the emailed rating link. Still not seen: "Mark done without a rating".

People > Post-onboard has a new Values column. Ticking a 90-day check-in done now opens a
short form first: the hiring manager's 1-4 rating of the four core values, "Would you
hire this person again?", the manager's name and a note, entered by HR (his call, Nov 10).
Save and mark done, or Mark done without a rating. Rate opens the same form any time.
Checked: the new table exists in the live database (the change was only CREATE TABLE and
two indexes, and the schema diff is empty after it); the ratings API answers, and refuses
an empty rating; the form, rendered on the server, shows all four values with their
buttons, the hire-again question and both actions; the Values column and 33 Rate buttons
appear on the page. NOT checked: clicking Rate, or saving, in a browser. On localhost the
People page loads but its buttons never come alive, in the in-app pane and in Chrome
alike, and swapping this file back to the committed version did not change that, so it
is not this change. Nothing was saved, because localhost writes the live database.

**How to check it, about two minutes, on the live site after deploy:**

- People > Post-onboard: click Rate on anyone. The form should open with the four values.
  Rate them, answer hire-again, save: the cell should show the average out of 4.
- Tick someone's 90-day check-in: the form should open first; Mark done without a rating
  should tick it with no rating.

**What would count as a pass:** both stick after a reload.

---

### 46. No training sheet has been imported since imports stopped doubling rows

**Status:** OPEN
**Added:** 2026-11-11

Feedback cmw2gd82m: importing the training sheet added a second row for pilots already
tracked, and a chart spelling ("Ben Fleckenstien") made an extra "from chart" row with no X.
Import now matches the same pilot's existing record (same start date, or an undated record
for the same aircraft) instead of adding one, and a misspelt chart name counts as covered.
Checked against the live 127 records without saving: re-importing all of them added 0;
a dated Matt Smith row filled his undated record instead of doubling it; the Ben
Fleckenstien typo no longer makes a row. NOT checked: an import through the Training tab
itself, which saves to the live chart.

**How to check it, two minutes:** Fleet > Crew > Training, paste the current sheet into
Import, then Save training.

**What would count as a pass:** the message says mostly "updated" and few or no "new", and
no pilot appears twice for the same training. (Two rows already there before the fix stay
until someone X's one out, for example Jonathan Gleisberg's undated Tentative row.)

---

### 48. Nobody has typed into the ten boxes that became the notes editor

**Status:** OPEN
**Added:** 2026-11-11

Feedback cmwcjtm5k, "sitewide": ten more boxes now use the notes editor (bold, italics,
lists, blank lines). Recognition message, interview scorecard comments, the onboarding-round
note, the public /welcome message, new hire notes (current and classic page), 90-day check-in
notes, orientation lunch notes, event Ramp & FBO notes, trip internal notes, and the travel
visit-pack answers. Nothing in the database was rewritten: old plain notes are read as they
are and only become HTML when somebody edits them. Checked: lint and typecheck clean, the
save/clean/display helper run on sample text (blank lines kept, scripts and click handlers
stripped, an untouched plain note stays plain), and the compliments, travel, people and
orientation pages render over HTTP with no error. NOT checked: typing into any of them and
saving, because the database is live and the in-app browser cannot drive these pages.
Four of them save when you click away rather than on a button — new hire notes, Ramp & FBO
notes, trip internal notes and the visit answers — and clicking one of the editor's own
toolbar buttons must NOT count as clicking away.

Also NOT checked by typing: the calendar's Edit interview Notes box, which now edits the
interview's write-up itself (before, an edit there never showed on the candidate profile).

**How to check it, four minutes:** on a test new hire, type two paragraphs with a blank line
between and one bold word into Notes, click Bold mid-way, then click somewhere else on the
page and reload. Do the same in one trip's Internal notes, and give one recognition. Then open
a test interview that has a write-up from the calendar, add a line to Notes, save, and open the
candidate's profile.

**What would count as a pass:** the blank line and the bold survive the reload, nothing saved
while you were only clicking toolbar buttons, the recognition shows its blank line on the
feed, and the calendar edit shows in the write-up on the profile.

---

### 49. Check-in replies: nobody has marked one handled, and the HR-only wall and the morning run are unproven

**Status:** BLOCKED ON DEPLOY
**Added:** 2026-11-11

**Sweep 2026-11-21:** Mostly passed. Mark handled and the level override have been used for real (Chris Sharpe handled Nov 17 by Aimee; Ryan Christensen and Riley Wooden overridden). The morning run files replies at 14:37Z on Nov 13, 16, 17 and 19 - a fixed daily time, though there is no run log; note the cron is 13:45 UTC, 6:45am Mountain in winter, not 7:45. No non-HR account has People at all. Grace Ward's reply is still unhandled. Left: the Check for replies button on the live site.

Replies to the check-in emails ("Re: Just checking in") are now read out of Front, sorted
by Claude, and shown on the Post-onboard grid, the dashboard and the person page. Checked
locally against the live data: the four real replies were filed (Grace Ward as Needs
action, three as All good), a second run filed nothing twice, the grid showed the icons,
counts and "no reply" marks, Grace's dialog opened and fitted at 1536x695, and the dashboard
and her profile listed it. NOT checked: (1) pressing Mark handled or changing the level in
the dialog, because that writes Grace's live record (the same save was exercised through
the API as a no-op); (2) that a non-HR login sees nothing - local dev has no login, so it
always counts as HR; (3) that the 7:45am Mountain Vercel cron actually fires; (4) the Check
for replies button on the live site.

**How to check it, three minutes:** on the live site open People, Post-onboard, press Check
for replies, then open Grace's gold icon, type what was done and press Mark handled. Ask a
non-HR user to open the same tab. The next morning, look for "Check-in reply cron" in the
Vercel logs.

**What would count as a pass:** Grace's icon turns navy and drops off the dashboard's
follow-up list, the non-HR user sees no reply icons at all, and the log line is there.

---

### 52. Question bank: Duplicate, "Apply this formatting to all questions" and Import have never saved for real

**Status:** OPEN
**Added:** 2026-11-11

**Sweep 2026-11-21:** Duplicate PASSED (see #47: the copy saved with its category and both core values). Apply this formatting to all questions PASSED for real: he pressed Yes on its confirm, and all questions were rewritten at 22:19:21Z with font-size 18px (undo record "Question: Large", 22 rows). Its Undo PASSED: POST action "undo" (the same call the Undo bar makes) returned restored 21, skipped 1 (the TEST COPY, which he had already deleted), and the live table then held 21 questions, 0 with any font-size, 0 TEST COPY. Left: Import from a document, and its Undo.

Feedback cmwcmsbwn: each question has a Duplicate button; each box in the edit form has
"Apply this formatting to all questions" (with an Undo bar); and "Import from a document"
reads a .docx, PDF, text file or pasted text into separate questions for review before
adding. Checked in a browser with every save blocked: Duplicate opened a new form with all
three boxes, the category and both core values copied, and sent a new-question save; Apply
showed the right confirm and sent the right box; a pasted two-question document was read
for real in 6 seconds and split correctly (question, category, values, Strong answer,
Listen for), and Add sent both. The formatting logic was dry-run on the live 22 questions:
"Large" would change all 22 and the wording of none; "Normal" changes none. NOT checked:
any of the three actually saving, both Undo buttons, a real .docx upload through the page
(the .docx reader itself was tested on a generated file), and a PDF (never tried).

**How to check it, five minutes:** Duplicate one question and save it, then delete the copy.
Make one Question box Large, press Apply to all, look at the list, then press Undo and check
every question is back. Import her question doc (download it as .docx), add one, then use
Undo that import.

**What would count as a pass:** the copy saves as a new question; Apply changes every
question's box size and Undo puts them all back; the imported question matches the doc word
for word, sits at the end of the bank, and Undo removes it.

---

### 56. Interview drawer: not tried on a phone, and no scorecard saved, edited or deleted from inside it

**Status:** OPEN
**Added:** 2026-11-11

Aimee feedback cmwco78eg, his pick of option A: an interview opens in a side drawer over the
candidate's Interviews tab and over the Calendar, with the write-up and the scorecards both open
and each collapsible. Checked in Chrome at 1536 by 695: opening, collapsing, the newer and older
arrows, Escape, the unsaved-scorecard warning, ctrl-click still opening the full page, and the
Calendar's Edit interview link. NOT checked: a phone-width screen (Chrome would not resize below
desktop), and any scorecard save, edit or delete from inside the drawer (live database).

**How to check it, three minutes:** on a phone, open a candidate's interview Scorecard. Then, on
a test interview, add a scorecard in the drawer, edit it, and delete it.

**What would count as a pass:** on the phone the drawer fills the screen with no sideways
scroll; each scorecard change shows in the drawer straight away, with no reload.

---

### 59. Nobody has seen the Requested and Scheduled rows on screen, or clicked Done on one

**Status:** OPEN
**Added:** 2026-11-13 (updated the same day for the Scheduled look in 7f0ab9e)

**Sweep 2026-11-21:** Attended orientation PASSED: the Nov 17 session is COMPLETE and all four attendees' Attended orientation went DONE 186ms after it (2026-11-17T18:38:32Z), with no clicks. Still not done: Done on a pilot's Requested iPad or credit card (12 pilot rows still Requested).

Both kinds of hold now look the same: their own lit navy-and-gold segment ahead of
To do / Done / N/A, **Done** unlit, the label not struck through, and a hint under it.
- **Requested** (a pilot's "Received iPad" and "Received company credit card"): the
  segment says Requested; the hint says "Click Done when it arrives".
- **Scheduled** (Attended orientation while on an upcoming session, Travel
  accommodations while a trip is booked): the segment says Scheduled with a clock; the
  hint says it clears itself when the orientation session (or the trip) is marked complete.
On the Onboarding grid both cells show the word instead of a tick.

Checked: the server-rendered HTML for Cameron Morgan showed the Requested markup (before
7f0ab9e); the commit agent ran eslint and tsc on 7f0ab9e. NOT checked: anything on screen.
Chrome could not reach the dev server, and Done was not clicked because it writes the live
database.

**Update 2026-11-14:**
- **He confirmed light and dark mode look right on the checklist.**
- **Phone, checked in the in-app browser at 375 and 329 wide.** The page was Cameron
  Morgan's checklist (Requested x2, Scheduled x1). It was measured, not eyeballed, because
  the pane's screenshot crops the right edge. At both widths the page is exactly screen
  width with no sideways scroll, and none of the 20 rows has anything past its edge. The
  hold segment drops to its own line under the label and ends 11px (329) / 12px (375)
  inside the row. The word fills the segment's height. The orientation hint wraps to two
  lines at 329 and stays inside.
- **On the Onboarding grid at 329,** all 18 Scheduled/Requested cells fit their column
  with nothing clipped.
- **Problem found, not caused by #59:** the grid itself is 1980px wide on a 329px phone and
  scrolls sideways, about 1.2 hires on screen at a time. The phone rule (Nov 14) says a wide
  table gets a phone layout instead. That is a separate piece of work, not part of this item.
  **Fixed the same day (commit agent, Nov 14):** another session built the phone layout in
  cb5f93d. Below md each hire is now a card and nothing scrolls sideways at 375 or 329. A real
  tap on it is item 65.
- **Still not done:** clicking Done on a Requested row, and Attended orientation turning
  Done by itself after the Nov 17 session is marked complete.

**How to check it:** open a pilot hire's Checklist tab whose iPad has not arrived and who
is on the upcoming orientation (Nov 17). Look at it in light and dark mode, and on the
Onboarding grid. When the iPad really arrives, click **Done**. After the Nov 17 session is
marked complete, look at Attended orientation again.

**What would count as a pass:** the Requested and Scheduled words sit centred in their
segments, and Done looks like the next click; after Done the Requested row is struck
through with Done lit and the hint gone, and its grid cell turns into a tick; once the
session is marked complete, Attended orientation turns Done by itself with no click.

---

### 68. The evaluator's value calls and its learning have only been tried on a made-up guide

**Status:** OPEN — deployed 2026-11-16 (b6ebd49)
**Added:** 2026-11-16

On a guide's page, every core value chip now ticks and unticks (a question's own value can
be unticked: "asked, not shown"); **Evaluate answers** suggests which values each answer
showed as well as its rating; and when you change a rating or a value it suggested, that
correction is saved and shown to it as an example on later runs. A **What it has learned
from you** list under the button shows each correction with an × to forget it. Checked by
the session on localhost against a throwaway guide with made-up answers: untick by hand,
evaluate (it unticked Fueled by Passion on "tell me about yourself" and added Deliver the
Wow and Team Alignment, each with a reason, and left hand-set values alone), two
corrections stored, a second run reported using both, a chip tapped in the browser became a
third, and the × forgot it. The guide and all three test corrections were then deleted, so
the live evaluator has learned nothing yet. NOT checked: a real interview's answers, whether
the corrections actually change its later calls in a way he agrees with (that takes several
real interviews), and the page in dark mode.

**How to check it:** after a real interview, press Evaluate answers, change any value or
rating you disagree with, then open What it has learned from you. On the next interview's
guide, press Evaluate answers again and see whether it makes the same mistake.

**What would count as a pass:** your corrections are listed in plain words; later
evaluations follow them on similar answers; nothing you set yourself was changed by it.

**Update 2026-11-16 (commit agent, read-only on the live database):** the first real
corrections are stored: 3 active, 3 in all, so the evaluator now has three of his lessons to
read on its next run. Whether it follows them is still to be seen on the next interview.

---

### 83. No in-app sign-off link has been sent by email, filled in on a phone, or seen in dark mode

**Status:** OPEN
**Added:** 2026-11-21

**Note (Nov 24, commit agent):** the Sign-off tab was removed from Reports in 6c7f034, so this check can no longer be run as written. The hiring-manager sign-off was dropped on Nov 23. Left open for him to close.

The definitions sign-off moved from the Google Form into Journey (his ask, Nov 21): Reports >
Sign-off > "Send a sign-off link" emails one hiring manager a no-login link (/signoff/<token>)
for the departments ticked, with the email body editable before it goes; the form shows the
draft definitions and the 14 questions (his Google Form wording); question 14 is the sign-off.
Checked by the session against the local site with one test record written straight into the
store (then removed; the store is empty again): the form page renders with the departments
filled in; a bad link says so; an incomplete submit is refused with the missing questions
named; a full submit saves, a second submit is refused, and the link then says "Thank you";
unknown departments and choices are dropped and markup is stripped; the Reports tab, the HR
route and the live /reports page show the sign-off ("2 of 15"); the email was built (not
sent) and reads correctly. NOT checked: a real send through Front (it needs the deployed site,
since a localhost link is refused for a real send), the Send dialog clicked in a browser,
resend and cancel, filling the form on a phone, dark mode.

Added the same day (his ask): "Send sign-off links" sends to many at once - a checklist of every
current employee, the 24 suggested sign-offs first with their departments ticked (found by
name, by the Chief Pilot / Assistant Chief Pilot role, or by the Lead Cabin Attendant title;
the DO is Harry Mitchel, added by the commit agent), anyone else addable by email, one
editable email, one link each; people already waiting or signed off are skipped and named.
Checked by the session: the list builds from live data (24 suggested, 155 others, 179 in all,
none unmatched; re-run by the commit agent) and the skip rule works on two test records, removed after. NOT checked: the
checklist clicked in a browser, and a real send to many.

**How to check it, five minutes, after deploy:** Reports > Sign-off > Send a sign-off link to
yourself, tick one department, edit a line of the email, send. Open the email on your phone,
fill the form in, then reload Reports > Sign-off.

**What would count as a pass:** the email has your edit and the link; the form is easy on a
phone; after sending, the tab shows your sign-off and its answers.

---

### 82. Reports > Sign-off has not been opened in a browser, on a phone or in dark mode

**Status:** OPEN
**Added:** 2026-11-21

**Note (Nov 24, commit agent):** the Sign-off tab was removed from Reports in 6c7f034, so this check can no longer be run as written. The hiring-manager sign-off was dropped on Nov 23. Left open for him to close.

A new admin-only Reports tab holds the definitions sign-off form's links (the form to send,
editing it, the answers Sheet, the sign-off page) and reads the answers live from the Sheet:
how many of the 15 departments have answered, which are still to answer, who answered, a
count with names for every choice on questions 1-9 and 11, and every written answer. Checked
by the session: it reads the live Sheet (his test answer "aimee test" on all 16 questions;
Q11's 10 ticks all counted after his rewording was matched), renders on the server with 4
links and no table, and the live /reports page carries the tab and the data with no error
page. NOT checked: clicking the tab, a phone, dark mode, and a real hiring manager's answer.

**How to check it, one minute:** Reports > Sign-off. Open each link; read one question.

**What would count as a pass:** the links open the right Google files; each question shows
its answers with names; on a phone nothing scrolls sideways.

**Update 2026-11-21 (commit agent):** superseded the same day. The Google Form was retired
before anyone was sent it, and Reports > Sign-off was rebuilt to send no-login links from
Journey and show their answers (1df4a42); it no longer reads the Google Sheet. What is left
to check is item 83. Left open for him to close.

---

### 81. The trimmed contact card, Just the contact, and Active have not been tried on real phones or live data

**Status:** OPEN — deployed 2026-11-21 (4bdb9b5)
**Added:** 2026-11-21

From Aimee's feedback (cmwkyt6vc, cmwqqv5hi). Make contact now asks whether this is a new
contact or one already on the phone; for an existing one it hands over only the details she
ticks, because the iPhone's Add to Existing Contact adds every line it is given (her recording
showed the phone and both emails doubled). Send contact card has a **Just the contact** option:
a short editable note with the card, no new-hire wording, no checklist tick. Each application
has an **Active** button. Checked by the session in desktop Chrome and phone emulation: the
trimmed card files (each detail on its own), the menu, the send preview for Flynn McFarland
(cancelled, nothing sent), and the Active button's layout. NOT checked: on a real iPhone, a
trimmed card through Add to Existing Contact adding only the ticked lines; on a real Android
phone, what opening a trimmed card does (a new contact or a merge); a Just the contact email
opened on a real phone; pressing Send or Active on live data.

**How to check it:** on your iPhone, open a person you already have in Contacts, press Make
contact, choose the existing-contact option with one detail ticked, and add it. Try the same
on an Android phone. Send yourself a Just the contact for someone already working here and
open it on your phone. Press Active on one application.

**What would count as a pass:** the existing contact gains only the ticked detail, with no
doubled lines; the Just the contact email reads right and its button saves the card; Active
lights and the candidate still reads as open in the lists.

**Update 2026-11-21, from him — the Make contact flow asks the wrong question first:** "This
isn't how it works on an iPhone. On an iPhone, you have to choose 'Create new contact' or 'Add
to existing contact,' so from this view, I can't tell if this contact already exists." The app's
menu asks "Not in your phone yet?" or "Already in your phone?" before the phone shows its own
Create New Contact / Add to Existing Contact sheet, and the app cannot see the phone's contacts,
so the person has to guess. The trimmed card is only useful if they already know. Open as a
design question on the roadmap; the iPhone test above cannot be done as written until it is
decided.

---

### 78. No anytime check-in has been sent, answered or seen in a browser yet

**Status:** OPEN
**Added:** 2026-11-19

**Sweep 2026-11-21:** One anytime check-in has been sent (a day-10019 request in onboarding/checkin-rating-requests, 1 year 7 months); it has not been answered yet.

Past their first year, HR can now send the manager the same check-in at any time, from the
person's profile > Check-ins > Anytime check-ins > "Send a check-in (1 year 7 months)" (his
ask, Nov 19). It uses the same dialog, link and form as the 3/6/12-month ones, is named for
the person's tenure in whole calendar months, ticks nothing and archives nobody, and works for
archived people (only terminated or cancelled blocks it). Checked by the session: the month
math agrees with the calendar on 4,804 start dates and four "today"s (including after 6pm
Mountain); for Claire Monro (archived, started Apr 7 2025) it offers "Check-in at 1 year 7
months" to Dave Esmond and does not treat her as left, while her 12-month one still does; the
email reads "has been with SkyShare for 1 year 7 months"; her live profile serves the section
and the button. NOT checked, because each step emails or writes for real: sending one, the
manager opening and submitting the form, the rating then showing on the profile and on
Reports > Check-ins (Anytime filter), resend and cancel, a phone, dark mode.

**How to check it, five minutes:** on the profile of the person you want, Check-ins tab, press
Send a check-in, send it to the manager (or to yourself first). Open the link, submit, reload
the profile.

**What would count as a pass:** the email says the right tenure; the form opens without a
login; after it is sent the rating shows under Anytime check-ins and on Reports > Check-ins
under Anytime; nothing on the person's checklist changes.

---

### 77. The remote orientation email has never been built from its real Front template, and the remote panel has never been used

**Status:** BLOCKED ON DEPLOY, and on a Front template that does not exist yet
**Added:** 2026-11-19

**Sweep 2026-11-21:** The Front template "4. (Remote) New Hire Orientation" now exists (seen in the template list on 2026-11-21). Still blocked: there is no upcoming orientation session to try it on.

The "4. Remote prep" orientation email finds its Front template by name,
**4. (Remote) New Hire Orientation**. On 2026-11-19 no template by that name
existed: the full template list returned 85 and none was a remote one. Until
he creates it in Front (he chose to, Nov 19; the wording lives only in Front),
the Send button shows a "create it in Front" message and sends nothing. What was
checked: the link and Meet-link fill against sample markup, the in-person refusal,
the not-yet-created error, and the invitation still building unchanged. What was
NOT checked: a preview built from the real template, any send, and the panel's
Save buttons. Saving writes to the live database, so it wasn't clicked from a dev
session.

**How to check it, about five minutes:** create the template in Front. Open an
upcoming session with someone marked Remote. Under **Remote attendees**, add the
video and presentation links and save, and save a lunch card. Then press
**Send…** in the **4. Remote prep** column, change a word in the editable body
box, tick test mode, and send it to hrotasks@.

**What would count as a pass:** the test email arrives with the session date, a
clickable Meet link, the links list, your edited word, no leftover "delete this
part" text and no warnings you didn't expect. The template in Front is unchanged
afterwards. The links and lunch card are still there after a reload.

---

### 85. Nobody has saved an HR's call on Quality of Hire, and the category tiles have not been seen live

**Status:** OPEN
**Added:** 2026-11-23

Commit 589ffe9 sorts every hire into the Good Hire Criteria categories and adds an "HR's
call" picker for admins. The commit agent re-counted the categories read-only against
live data (2021-2025: 151 good, 38 bad, 34 regretted loss, 16 not counted, 5 too soon,
8 needs a call). The session saw the tiles and opened the Needs a call list on its local
page. But no call has ever been saved, because saving one writes live data. Nobody has
looked at the live site either.

**How to check it:** on the live site, Reports > Hire quality (/reports/hiring/quality). Tap the Needs a call
tile: 8 people should be listed. Use the HR's call picker to record one real decision
HR has already made, e.g. the first-year quitter HR now calls a Satisfactory hire. Then
reload.

**What would count as a pass:** after the reload the call is still there. That person
has moved to the Satisfactory tile and the tile counts went up and down by one. Clearing
the call puts them back where they were.

---

### 84. The would-hire-back answers have not been seen on the live Quality of Hire page

**Status:** OPEN
**Added:** 2026-11-23

HR's 59 answers (37 yes, 22 no) are stored live and the commit agent re-counted them
read-only. The session saw them on its local page (37 "Would hire back", 22 "Wouldn't
hire back"), but nobody has looked on the live site after the deploy, and that table's
phone layout still scrolls sideways (unchanged by this work).

**How to check it:** on the live site, Reports > Hire quality > Every hire, find
Nicholas Smout (started Apr 14 2025) and one of the yes answers, e.g. Echo Campbell
(started Jan 4 2021).

**What would count as a pass:** Smout's Category column says Bad hire, with "Quit in year
one; HR would not hire them back" under it; Campbell's says Regretted loss, with "Quit in
year one; HR would hire them back". (Changed Nov 23 by 589ffe9: the answer now shows
under the Category column, no longer in the Why column.)

---

### 86. "Where's the Executive?" has never been scanned with a real phone, a printed card, or a non-admin login

**Status:** BLOCKED ON DEPLOY
**Added:** 2026-11-24

The Christmas party scavenger hunt (Events > Christmas scavenger hunt) was tested
on a laptop: every claim case over HTTP, the scan page in a 375px browser, the live
display at 1920x1080, the PDFs rendered to images. Four things were not:

1. **A phone camera scanning a printed code.** The codes point at the live site, so
   nothing can be scanned until this is deployed.
2. **A photo upload.** Not tried, because from a laptop it writes the live S3 bucket.
3. **A non-admin account.** Local dev bypasses login, so the 404 on the admin page
   and the 403 on its API for a viewer / hiring manager were checked in code only.
4. **The hangar Wi-Fi.** All 200 guests share one public IP; the per-IP limit is set
   to 900 claims a minute so it should never bite, but it has not met a real crowd.

**How to check it:** after deploy, turn the game on (Settings tab), print the
one-page PDF, scan two codes with an iPhone and an Android phone, scan one twice,
upload one executive photo, and open /events/exec-hunt signed in as a hiring
manager. Then press Reset before the party.

**What would count as a pass:** first scan asks for a name, second one does not,
the repeat says "You've already found this one!", the photo shows on the scan page
and the cards PDF, the hiring manager gets a 404, and Reset leaves the printed
codes working.

**Moved Nov 25 (company events):** the hunt admin now lives in People > Company Events >
2026 Christmas Holiday Party > Activities, and /events/exec-hunt forwards there for
anyone who can edit events (a hiring manager still gets the 404). Also open that
Activities tab as the hiring manager: the pass is that the hunt is listed but its admin
(Settings, cards PDF, Reset) is not shown.

---

### 87. The event to-do tracker has not been used on a phone, or with a real meeting transcript

**Status:** OPEN
**Added:** 2026-11-24

The to-do tracker on an event page (status, owner, notes, filter by person) and its
"Import from a meeting" dialog were tested on a laptop: the AI read on a sample
transcript, save, status changes, notes and undo over HTTP; the dialog's review
step in Chrome at desktop width. Two things were not:

1. **Phone width.** Chrome would not shrink the window, so the tracker and the
   dialog were never looked at at 375px. Built as stacked cards with wrapping rows
   (no table), but unseen.
2. **A real planning transcript.** Only a short made-up one was read. A real hour-long
   meeting, with people talking over each other, has not been tried.

**How to check it:** open the 2026 Christmas Holiday Party event on a phone, then
import the first real planning-meeting transcript and read the suggested list
before saving.

**What would count as a pass:** nothing runs off the side of the phone screen, and
the suggested to-dos name the right people (or leave the owner blank where nobody
took it on).

---

### 88. The party store has never run on two registers at once, on the venue Wi-Fi, or behind a real login

**Status:** BLOCKED ON DEPLOY
**Added:** 2026-11-24

The Christmas party store (Events > Party store) was tested on a laptop against a
throwaway TEST store, since deleted: check-in, sales, over-balance and sold-out
refusals, two simultaneous charges for the last item (one won, one was told sold
out), refunds, pre-orders from the personal link, cancel, pick-up, a contractor
refused, CSV export, and the employee page at 375px. Three things were not:

1. **A real login.** Local dev bypasses sign-in, so a viewer / hiring manager
   getting a 404 on the store pages and a 403 on its API was checked in code only.
2. **Several registers on the hangar Wi-Fi.** Each register re-reads the store every
   10 seconds; that has not met a real crowd or a weak connection.
3. **An employee opening their link on their own phone**, from an email or text.

**How to check it:** after deploy, open the store, add two real items, and ring up
one test sale each from two devices at the same time; then refund them. Send your
own pre-order link to your phone and place and cancel a pre-order. Open
/events/store signed in as a hiring manager.

**What would count as a pass:** both devices show the same balances within ten
seconds, the refunds put the credit back, the phone page works, and the hiring
manager gets a 404.

**Moved Nov 25 (company events):** the store now opens inside People > Company Events >
2026 Christmas Holiday Party > Party store, and /events/store/<id> forwards there for
anyone who can edit events (a hiring manager still gets the 404). Also open that Party
store tab as the hiring manager: the pass is the line "Only people who can edit events
can run the party store" and no register or balances.

---

### 92. Nobody without admin rights has suggested a party activity or left a note

**Status:** OPEN
**Added:** 2026-11-25

Events were split on Nov 25: external ones are Recruiting > Career Fairs (/events),
internal ones People > Company Events (/company-events). A company event has Overview,
Guests, To-dos, Party store and Activities tabs, and the scavenger hunt is one activity.
Anyone who can see events can suggest an activity (it starts as Idea) or leave a note;
only people who can edit events set its status and who runs it, or remove it. Local dev
signs everyone in as an admin, so only the admin path was tried: the session created,
noted, set status on and deleted a TEST activity, and confirmed an external event and a
second hunt are refused. Every page was checked at 375 and 329 in browser emulation
only. NOT checked: a recruiter, hiring manager or Viewer suggesting an activity or
leaving a note, and a real iPhone or Android.

**How to check it, about five minutes:** sign in on the live site as someone who can
see Events but not edit them. Open People > Company Events > 2026 Christmas Holiday
Party > Activities, suggest an activity called TEST and leave it a note. Then, as an
admin, delete it. Do the same on a phone if you can.

**What would count as a pass:** the suggestion saves as Idea with the note under it; the
non-admin sees no status, owner or remove controls; after the admin deletes it the hunt
is still the only activity; nothing runs off the side of the phone screen.

---

### 93. A check-in has never gone to two supervisors on the live site

**Status:** OPEN
**Added:** 2026-11-25

Since Nov 25 a manager check-in can go to both supervisors. Each gets their own link,
the saved rating is the average once both have answered, and only then is the check-in
ticked done. The bulk dialog also picks first supervisor, second, both or someone else,
can replace a link already out, and Post-onboard can cancel links in bulk. Checked by
the session: the averaging maths (15 checks) and the whole two-supervisor flow (21
checks) against a stand-in database, the live bulk plan read-only (nothing saved), and
both dialogs at 1536x695, 375 and 329. NOT checked: a real send, a real cancel, or a
manager submitting a link on the live site.

**How to check it, about ten minutes:** on the live site, send one person's check-in to
Both supervisors, with you as one of them if you can. Answer one link. Check that the
check-in is NOT ticked yet. Answer the other, then open View both scores on the
profile's Check-ins tab. Then tick two people on Post-onboard and use Cancel check-in
links on a test link.

**What would count as a pass:** each supervisor gets one email from hrotasks@. The
saved rating is the average of the two and the check-in ticks only after the second
answer. View both scores shows each person's answers. The bulk cancel asks first with a
count and leaves answered links alone.

---

### 94. The party guest list and the invoice scan have never been used for real

**Status:** OPEN
**Added:** 2026-11-25

Two Events features shipped Nov 25. A company event's Guests tab lists everyone on the
event roster (194 people on Nov 25: 179 current employees plus 15 contractors) with
attending, not attending or no response, plus one, guest name, allergies and the other
RSVP answers. It re-reads the linked RSVP Google Sheet each time the tab opens, takes a
CSV, Excel or PDF upload, has Undo last update, and sends a BCC reminder from hrotasks@.
Supplies has Scan an invoice: Claude reads the invoice and mock-ups, names each item from
the invoice line, crops its picture, and saves nothing until HR confirms. Checked by the
session: a read-only preview of the real RSVP sheet (65 rows, all 65 matched, 61
attending, 4 not, nothing saved), a scan of the 5 sample PDFs (4 items, names, quantities
and prices right), and the picture crop on a static test page. NOT checked: either
dialog in the app in a browser (the dev build broke mid-test), linking the sheet,
an upload, a reminder send, saving a scan, and the phone and dark-mode layout of the
Guests tab and the scan dialog.

**How to check it, about ten minutes:** Aimee opens People > Company Events > 2026
Christmas Holiday Party > Guests on the live site, links the RSVP sheet and reads the
preview before confirming. Then she sends a reminder to herself only. In Supplies she
scans one real invoice with its mock-up and saves it, then opens both on a phone, in dark
mode too.

**What would count as a pass:** about 61 attending and 4 not attending after linking,
the reminder arrives once from hrotasks@ with nobody visible in To, the saved item has
the invoice line's name and its own picture on the Supplies list, Undo last scan removes
it, and nothing runs off the side of the phone screen.

---

### 89. The party store credit email has never been sent — not even to the test inbox

**Status:** OPEN — waiting on him, by his choice
**Added:** 2026-11-24

He asked for sending to be built but for nothing to go out until he chooses
(Nov 24 2026). So the send path was checked only up to the point of sending: the
dialog loads, lists 179 people who can be emailed, previews the email, starts with
nobody ticked, and the server refuses a send that is unconfirmed, empty or over 20
at a time. No email has gone anywhere, and zero PartyStoreEmail rows exist.

**How to check it:** when he is ready, open the store on the live site, Balance
sheet, "Email links…", tick ONLY yourself, and send. Open it on a phone and tap the
link.

**What would count as a pass:** one email arrives from hrotasks@ with your first
name, your real credit left and a link that opens your own store page; the dialog
then shows you as "emailed".

---

### 90. Nobody without admin rights has opened the new Reports library

**Status:** OPEN
**Added:** 2026-11-24

Reports became a library on Nov 24 (his pick of five redesigns): a side list of
reports, At a glance first, each report on its own link. Hire quality and Manager
check-ins are admins only - the side list leaves them out for anyone else, the At a
glance cards about hire quality are not sent to them, and typing either URL sends
them back to At a glance. Local dev signs everyone in as an admin, so the session saw
only the admin view. Checked by the session: every page answers 200 and renders the
library; desktop, 375px and 329px (no sideways scroll on At a glance or Turnover);
dark mode on At a glance. NOT checked: a non-admin's view, Export PDF's printed
layout, and the Share button on Fleet progression from its new place in the toolbar.

**Added by phase 2 (Nov 24, not yet checked either):** Offers became its own report
(/reports/hiring/offers, HR only), the offer tracking check moved to Recruiting >
Offers, the Hire quality uploads moved to Data > Imports, and a new Data > Cleanup page
holds source renaming and the Paycom mismatches. All four are admin-only in part. A
real rename on Cleanup and a real upload on Imports have not been tried from their new
places either, because both write live data.

**How to check it, about five minutes:** sign in on the live site as someone who is
not an admin but can see Reports. Open Data > Reports. Then type
/reports/hiring/quality and /reports/hiring/offers into the address bar. Then open
Recruiting > Offers, Data > Imports and Data > Cleanup.

**What would count as a pass:** the side list shows no Hire quality, Manager
check-ins or Offers, At a glance shows no "Left in their first year" or "Good hires"
card, and both typed URLs land back on At a glance. Offers shows no Tracking check,
Imports shows no Hire quality uploads, and Cleanup shows the source names but not
"Paycom and Journey disagree". As an admin, one source rename on Cleanup sticks after
a reload.

**Moved again Nov 25 (menu layout 2):** the Reports side list is now in the blue menu
under Data, not on the page; the Hire quality uploads left Data > Imports for their own
admin-only page, Data > Upkeep (/imports/hire-quality); and Imports is now Recruiting >
Records > Imports. Read "the side list" above as the Data menu, and check Imports
there. Item 91 covers the rest of the menu move.

---

### 91. Nobody without admin rights has seen the reorganised menu

**Status:** OPEN
**Added:** 2026-11-25

The menu was reorganised on Nov 25 (his pick, layout 2). Recruiting gained a Records
section (Imports, Duplicate Review, Historical Archive). The Reports list moved into
the blue Data menu with its Find a report box. HR-only reports are filtered out of that
menu for anyone who is not an admin. Handbook became a Help button at the bottom of the
rail for every role. Fleet positions moved to Recruiting, New hire contacts to
Onboarding, and Business cards and the Paycom roster import to People. Block management
became an admin-only Manage tab on Content Blocks, and its old address redirects there.
Access was not meant to change: every item kept its module id. Local dev signs everyone
in as an admin, so the session saw only the admin menu. Checked by the session: every
moved page answers 200; at 1536x695 the Recruiting menu (Records open), the Data menu and
the rail fit with no scrollbar; dark mode on the People menu; no sideways scroll at 375
and 329 in browser emulation (except Historical Archive, which is on the roadmap). NOT
checked: a recruiter's, hiring manager's or Viewer's menu, and a real iPhone or Android.

**How to check it, about five minutes:** sign in on the live site as a recruiter (not an
admin), and on a phone if you can. Open each blue menu, then the Help button. Then type
/blocks?tab=manage and /imports/hire-quality into the address bar.

**What would count as a pass:** the menu shows only the areas that person could open
before. The Data menu lists no Hire quality, Manager check-ins or Offers. Help opens the
Handbook. Content Blocks shows no Manage tab, and /imports/hire-quality does not show the
uploads. On a phone the drawer menu opens and every item can be tapped.

---

## Closed

### 2. Private HR notes have never been loaded by a non-HR viewer

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). After b0863e1 deployed: View as Alex Andrade (HIRING_MANAGER), GET /candidates/cmrtlf1kx000028rmteibvsbw (Luke Webb) returned his page with "Medium feelings" absent, "private Paycom note" absent, "HR-only note" absent, while 6 ordinary "Copied a Paycom note" Activity lines still showed. Positive control as Aimee (HR) on the same page: both "Medium feelings" and "private Paycom note" present. The note and every sign of it are gone for a non-HR viewer and still there for HR.
**Added:** 2026-09-11

**Sweep 2026-11-21:** After the deploy (d2afba5), View as Alex Andrade: Luke Webb's page no longer contains the note text ("Medium feelings" absent). Still FAILED on one point: his Activity list showed "Copied a private Paycom note (RICHARD PADEN, 6/19/2026 | 1:10 PM) to Luke Webb as an HR-only note", which tells a non-HR viewer one exists. Fixed in lib/data/candidates.ts the same day (rows pointing at a private note, by metadata noteId or wording, are dropped outside HR); against the live table it hides exactly 5 rows, one per private note. BLOCKED ON DEPLOY again: afterwards View as Alex and confirm /candidates/cmrtlf1kx000028rmteibvsbw contains neither "Medium feelings" nor "private Paycom note".

**Sweep 2026-11-21:** FAILED on the live site, now fixed in code, BLOCKED ON DEPLOY. View as Alex Andrade: Luke Webb's page HTML carried his private HR note ("Post interview (private Paycom note by Rich Paden...) Medium feelings...") inside the Timeline data, though the Notes tab correctly left it out; the same for Rich Paden. Cause: lib/data/candidates.ts built the timeline from every note with no hrOnly check, and put interview notes in it without the interviewer-visibility check. Fixed: the timeline now drops private notes and redacts restricted ones exactly like the Notes and Interviews tabs. After the deploy: View as Alex, fetch /candidates/cmrtlf1kx000028rmteibvsbw and confirm "Medium feelings" is absent.

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

### 39. The daily sheet check has never run on the live site, and no suggestion has been used for real

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). After the deploy (d2afba5), Scan now on Fleet > Crew as Aimee: "Last scanned Nov 21, 3:33 PM MT", no error, "74 people match the sheet exactly", 1 suggestion (CJ2 first officers: chart 0 open / 1 on hold, sheet 1 open / 1 on hold, CJ2 tab row 6), 1 already decided.
**Added:** 2026-11-03

**Sweep 2026-11-21:** FAILED on the live site, now fixed, BLOCKED ON DEPLOY. Fleet > Crew showed "Last scanned Nov 10, 5:43 AM MT" and "The scan could not read the sheet: Unable to parse range: 'CJ'!A1:L80". The sheet tab "CJ" had been renamed "CJ GA", and one missing tab failed the whole read, so nothing has been checked for 11 days. Fixed: the tab list says "CJ GA", and a missing tab is now named on the panel instead of failing the scan. Dry run against the real sheet and live chart, nothing stored: missingTabs [], 74 agree, 2 suggestions (Nick Lembo in training on PC-12; a CJ2 SIC seat count). After the deploy, press Scan now.

Feedback cmw13vxfx: every morning (12:30 UTC) the app reads the per-aircraft tabs of
"Recruiting Status Tracking" as the skyshare-calendar-sync service account and lists the
differences on Fleet → Crew as suggestions: each one shows what the chart has now, what
the sheet says and the exact tab and row, with Keep as is / Use suggestion / Change with
modifications. Checked on Nov 3 on this computer against the real sheet and chart: 68
people agree, 13 suggestions, every one applies cleanly; the panel's buttons, the edit
form and both error paths worked in Chrome with every save blocked, and a save echoed back
moved Elijah Hall on screen. **Nothing was saved**, and the scheduled run can only happen
on the live site. The live site uses the account's ORIGINAL key (Vercel); the Sheets API
and the sheet sharing were set up Nov 3, so it should read, but that has not been seen.

**How to check it:** the morning after the deploy, open Fleet → Crew. The Sheet check
panel should say "Last scanned" with that morning's time. Then use one suggestion you
agree with (for example a seat count) and reload, and press Keep as is on one you do
not, then reload again.

**What would count as a pass:** the panel shows a scan from that morning rather than an
error, the suggestion you used is reflected on the chart after the reload, and the one
you kept is gone from the list (it appears under "already decided").

---

### 1. A task email has never actually been sent

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). On the live site (Chrome, signed in as Aimee), Cameron Morgan's checklist > Confirm Pilot App on file > Send email > Send as test to hrotasks@skyshare.com. Read back from Front's API: HR Onboarding (inb_cru56) newest conversation at 2026-11-21T22:04:27Z, subject "[TEST — would have gone to camhawk42@gmail.com] SkyShare - Pilot Application Webform Request", from and to hrotasks@skyshare.com, body starts "Hi Cameron,", 4 href links (Adobe Sign webform). The step was not ticked. The test left one unassigned conversation in HR Onboarding.
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

### 16. Nobody outside HR has loaded the offer-details box, and it is the one box that holds pay

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Non-HR half: View as Alex Andrade (hiring manager) on the live site; GET /api/candidate-applications/cmqvr4s3p0efpxcrmn9xeffzs/offer-details returned {"allowed":false,"text":null,"at":null,"by":null}, and his Offers page HTML for Cameron Morgan contained neither "Offer details from the hiring manager" nor "Training Contract Length". HR half: 10 applications hold offerDetailsText saved by HR between Oct 26 and Nov 3 and still on file.
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

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). As Aimee on Gulfstream G200 First Officer: Edit role, pay "10,000 annually" -> "10,000 annually base", Save; reload showed it and Change history "Changed pay · Nov 21, 2:55 PM · aschaedig@skyshare.com · Pay: 10,000 annually to 10,000 annually base". Then removed the word and saved; reload shows PAY "10,000 annually" and a second history row the other way (9 saved edits). The job ends identical, so the Matchboard cannot have moved.
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

### 22. Nobody outside HR has searched since the search started reading notes

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). View as Rich Paden (hiring manager, Executive, not HR), who can see Sam Jaffari and Luke Webb: /candidates?q=guaranteed&in=notes found nobody, and q=-guaranteed read "nobody left out". Positive control as Aimee: the same Notes search found Sam Jaffari (the word is only in his private note). Alex Andrade's search also found nobody, but he cannot see Jaffari at all, so his result proves nothing.
**Added:** 2026-09-23

The candidate search can now look in notes ("Search in" > Notes). A private HR note is searched
for the HR team only - the same rule every note read follows - so a hiring manager searching a
word that appears only in someone's private note must not find that person, and must not see
them counted under Notes. Local dev signs everyone in as an admin, so the non-HR side has never
run.

Since the same day's follow-up, a word with a minus in front ("leave out") looks everywhere,
notes included, and says how many people it left out - so the same private note must not leave
anybody out for a hiring manager either, or show in that count.

**How to check it, about two minutes:** as HR, add a private note with an unusual word
("zebrafish") to one candidate. Sign in as a hiring manager and search that word, then search
`-zebrafish`. Then delete the note.

**What would count as a pass:** the hiring manager's search finds nobody, and the "Found in" row
shows Notes 0; and `-zebrafish` reads "not zebrafish anywhere · nobody left out".

---

### 28. Nobody without admin rights has opened Reports > Sources

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). No account today can hold Reports without editing it: the three hiring managers (Alex Andrade, Rich Paden, Jonathan Schaedig) have no Reports area at all (View as: /reports/sources renders "Page not found"), and the only other non-admin is the recruiter, who has edit. So no Rename or Save can reach a non-editor. Reopen if a view-only Reports account is ever created.
**Added:** 2026-09-29

Reports > Sources (/reports/sources) lets an admin or recruiter give a source spelling its tidy
name, or rename a source - "How people found us" on the Reports tab bar. The save route refuses
anybody without EDIT on Reports, and was checked over HTTP; what was not checked is the page
itself for somebody without it, because local dev signs everybody in as an admin, so there the
Rename and Save controls always show.

**How to check it, about a minute:** signed in as a hiring manager (or anyone who is not an admin
or recruiter), open Reports and click "How people found us".

**What would count as a pass:** the page shows both tables, the "Counts as" column reads as plain
text, and there are no Rename or Save buttons.

---

### 41. The Paycom email log has not been opened in a browser, and the scan has not added a row to it yet

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Live site: the month link gave only Oct rows (?month=2026-10, 62 rows); the "Interview recorded 4" tile gave exactly 4 rows (Jeongho Choi, Teya Clarke x2, Steven Cox) whose names link to /candidates/<id>; the newest rows are Raymond Cardenas Nov 20, which the 2-hourly scan logged (its run report: "One was new and got logged"). Non-HR: View as Alex Andrade shows "578 more hidden for your access (HR-only, personal, or outside your candidates)".
**Added:** 2026-11-06

Candidates > Paycom email log (/candidates/paycom-log) lists every Paycom email in Aimee's
Gmail since Jan 1 2025: 2,649 rows, re-counted against the live data. The page returned
200 locally with no error, but nobody has looked at it or clicked its filters. The
scheduled Paycom notes scan now has a new first step that adds each new email to the log;
that step has not run yet.

**How to check it:**

- Open the page on the live site. Click a month, a kind of email and an outcome tile, then
  search a candidate's name.
- After the next scheduled scan, check that today's Paycom emails appear at the top.
- Optionally, open it with a login that is not HR. The personal and HR-only rows should be
  hidden, with a count saying so.

**What would count as a pass:** the filters change the rows, names link to the right
profiles, new emails appear after a scan, and a non-HR login sees no personal or HR-only
rows.

---

### 43. Nobody has saved a scorecard with the core values, or an offer's recruiter and hiring manager, yet

**Status:** CLOSED 2026-11-11 - he tested both halves on the live site. The offer's
recruiter and hiring manager stuck after a reload, and Declined kept Save grey until a
reason was picked. After the Scorecard link went onto each interview on the candidate's
Interviews tab (5490627), he added a scorecard: the four core values came first, the
ratings saved, and they were still there when reopened with the pencil.
**Added:** 2026-11-10

Two Quality of Hire tracking pieces for Dec 10 are built. Every interview scorecard now
opens with the four core values (Fueled by Passion, Team Alignment, Deliver the Wow,
Solutions Focused), each rated Exceeds to Does Not Meet; and an offer has Recruiter and
Hiring manager boxes, with a reason now required when an offer is marked declined by hand.
Checked locally in Chrome: the scorecard editor shows the four values with their rating
buttons, and the offer shows both boxes. Checked by direct request: a declined offer with
no reason is refused, and the offer read back unchanged. Nothing was saved, because
localhost writes the live database.

**How to check it, about two minutes:**

- Open an interview, Add scorecard, rate the four core values and one question, save.
  Reopen it with the pencil: the ratings should still be there, values first.
- On a candidate's Offers tab with an offer started, type a recruiter and a hiring
  manager, click away, reload: both should stay.
- Set an offer to Declined: Save stays grey until a reason is picked or typed.

**What would count as a pass:** all three stick after a reload.

---

### 45. The tracking check on the Quality of Hire tab has not been looked at in a browser

**Status:** CLOSED 2026-11-11 - he checked it on the live site and all four checks passed:
recent offers listed with gaps marked missing, the offer he filled showed both ticks, names
open the candidate, and the 90-day list shows day counts.
**Added:** 2026-11-10

Reports > Quality of Hire now has a "Tracking check" section: every offer made since
Dec 10 (until then, a practice run over the last 30 days) with four marks - interviews
logged, recruiter, hiring manager, and a decline reason if declined - plus 90-day ratings
due. Checked: it runs on live data (practice run, 9 offers since Oct 12, 0 with all four,
6 with no interview logged, 13 ratings due), the section renders on the server with all 9
rows, and the live Reports page carries its data. NOT checked: looking at it in a
browser. On localhost the Reports page, like the People page (item 44), loads but never
comes alive, in the in-app pane and in Chrome.

**How to check it, one minute, on the live site after deploy:** open Reports > Quality of
Hire and scroll to "Tracking check".

**What would count as a pass:** the practice run lists the recent offers, the gaps say
"missing", each name opens the candidate, and the 90-day list shows people with their day
count.

---

### 47. Nobody has saved a question-bank question in the new editor or dragged one into order

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Live site: duplicated "What questions do you have for me?", added a blank line and bold, a third core value, both guidance boxes, saved; after reload the stored HTML is <p><strong>TEST COPY</strong></p><p></p><p>What questions...</p> with the blank paragraph 17.5px tall, three value tags, Strong answer and Listen for intact. Move down, then a real mouse drag of the grip, each held after reload. Note: blank lines at the very START of a box are trimmed on save. The TEST COPY question is still in the bank and must be deleted (see #52).
**Added:** 2026-11-11

Feedback cmwcjtm5k: the question bank's Question box is now the notes editor (bold,
italics, lists, blank lines), and the guidance under it is two separate editors, "Strong
answer" and "Listen for" (existing questions are split at read time; the old prefixes
become the labels). A question can carry several core values, and questions can be dragged
(or moved with arrows) into order. Later check, same way: the two-block form opened with
the old "Strong answer: ... Listen for: ..." text correctly split and sent them separately.
Checked in Chrome with every save blocked: the editor loaded existing text, Enter-Enter and
bold produced a blank line and bold text in what would be saved, two core values went in
the save, and Move down swapped two questions and sent the new order. The server side was
checked separately (the saved text keeps the blank line and drops anything unsafe). Nothing
was actually saved, and the drag itself was not performed with a mouse.

**How to check it, two minutes:** edit one question, add a blank line and some bold, tick a
second core value, put something in both Strong answer and Listen for, save, and reload.
Then drag one question above another and reload.

**What would count as a pass:** the blank line, bold, both value tags and both guidance
blocks are still there after the reload, and the new order holds.

---

### 50. Paycom steps that never happened: no profile page looked at since, and the scan's sweep has not run yet

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Annie Mader's live page has no 2026-02-02 Additional Interview (her interviews: HR Interview 01-23, HM Interview 01-30 and notes; read-only DB agrees). Her Activity still holds the Nov 6 backfill row "Recorded a Paycom interview invite ... Additional Interview, February 2nd", which is consistent with the Nov 11 rule. The 2-hourly scan's latest report: "the sweep removed nothing (0 steps)", no error.
**Added:** 2026-11-11

Paycom steps she clicked past are now removed from the interview and notes history when there
is no note AND no calendar event that day (his approval, Nov 11). 50 were removed in two passes
and checked against the live database (457 to 407 rows; undo tested). Teya's example and the
May 2025 to Jan 2026 calendar gap were settled the same day. NOT checked: (1) no candidate page
was opened in a browser after the removals, so the profile's Interviews and Notes tabs are
proven only by the database counts; (2) the scheduled Paycom notes scan has not yet run its new
step 0b (scripts/paycom-status-steps.ts --sweep --apply), so the going-forward half is untested.

**How to check it, three minutes:** open Annie Mader's candidate page (a step was removed for
her Feb 2 2026 Additional Interview) and look at the Interviews and Notes tabs. After the next
scan run, read its summary for the sweep line.

**What would count as a pass:** no "Additional Interview (Paycom)" on Feb 2 2026 on her page,
and the scan summary reports the sweep (usually "removed 0") without an error.

---

### 51. "Not Selected - Past Interview" and the two-date timeline have not been looked at on the live site

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Stephen Cox's live Timeline tab, rendered and clicked in Chrome: Not Selected - Past Interview Jun 17 2026 (CJ3+ Captain), Applied May 26, Not Selected - Past Interview May 20 (Phenom 100 Captain), Applied Apr 30 - the dates and wording this item lists from Paycom.
**Added:** 2026-11-11

41 applications that Paycom calls "Not Selected - Past Interview" said "Failed Interview" in the
app; they were reworded in the live database (undo tested), and the candidate timeline now shows
"Applied" on the application date and the outcome on Paycom's disposition date, on the right
calendar day. Checked from the local dev server against the live data: Stephen Cox's page served
Applied 04/30 and 05/26 and Not Selected - Past Interview 05/20 and 06/17, matching Paycom. NOT
checked: (1) nobody has LOOKED at the rendered timeline — the in-app browser cannot render this
app's pages, so only the data the page receives was read; (2) the live site, which keeps the old
one-entry timeline until this deploys (the reworded label shows there already).

**How to check it, two minutes:** after the deploy, open Stephen Cox's candidate page, Timeline
tab, beside his Paycom candidate profile (115698).

**What would count as a pass:** each application shows an "Applied" line and its outcome line,
with the same dates and wording as Paycom's Application Date and Dispositioned columns.

---

### 53. Current employee / Former employee: no real hire, termination or cancel has moved a candidate yet

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Status list in the candidate Edit form (Stephen Cox, opened and cancelled): Active, Current employee, Former employee, Inactive, Archived. Automatic moves since Nov 11, read-only DB (timelineEvent sourceType NewHire): Jake Aoki, Raymond Cardenas and Steven Cox -> Current employee on their move to onboarding; Carolyn Sanchez and Joel Garcia -> Former employee on termination; Jordan Pashayan and Brandon Edwards -> Inactive on cancel, each with a why line.
**Added:** 2026-11-11

Aimee feedback cmwclwrfp and cmwclxn4v. A candidate linked to an employee record now reads
Current employee or Former employee, and moves automatically when the employee record is
hired, terminated, reactivated, put on contract, canceled, rehired or imported. 173 of 185
linked candidates were backfilled on Nov 11 with an undo file (read back by the commit agent:
125 Current employee and Hired, 45 Former employee and Hired, 128 hire and 45 employment-ended
timeline entries). NOT checked: none of the automatic hooks has run for a real person yet, and
the Status picker in the candidate Edit form has not been clicked.

**How to check it, three minutes:** the next time someone is moved to onboarding, or an
employee is marked terminated, open their candidate page. Separately, open any candidate's
Edit form and look at the Status list.

**What would count as a pass:** the header pill says Current employee (or Former employee),
the timeline has an entry saying why, and the Status list shows Active, Current employee,
Former employee, Inactive and Archived.

---

### 54. Rating points: no 90-day rating exists yet to show the new points, and no scorecard has been saved under them

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Scorecard half: interview cmw116x4p (Christian Kuffer, scorecard saved Nov 18) shows "2 pts · Meets on all 4 = 4" and a Combined score (four Can Develop x 0.5 = 2). Post-onboard half superseded: the grid was rebuilt around the 1-10 check-in form (Nov 13), so there is no points cell any more; 21 real ratings are on file.
**Added:** 2026-11-11

Feedback cmwcobn71: interview scorecards and the 90-day check-in rating are now scored in
points that add up (Exceeds 1.5, Meets 1, Can Develop 0.5, Does Not Meet 0), shown against
"Meets on all N = N", instead of an average out of 4. Ratings are stored as names, not
numbers, so nothing was rewritten. Checked: the one rated scorecard on file (5 items) now
shows 6.5 pts against a par of 5 on its interview page, which renders without error; all
four values rated Meets give 4 points, all Exceeds 6. NOT checked: the Post-onboard tab's
rating cell with a real rating (the table holds 0 ratings today), and a scorecard saved
after the change.

**How to check it, two minutes:** rate one hire's 90-day check-in on People > Post-onboard
(Meets on all four), and save one interview scorecard with a mix of ratings.

**What would count as a pass:** the Post-onboard cell reads 4 pts; the scorecard shows its
points with "Meets on all N = N", and the interview's combined score sits beside it.

---

### 58. A screen recording sent from an iPhone has not been played back on the Feedback page

**Status:** CLOSED
**Closed:** 2026-11-13, by him: "this worked." Aimee sent a 53.6 MB iPhone screen recording
(ScreenRecording_11-13-2026 15-48-38_1.mp4, video/mp4) on feedback cmwfmv2qd at 23:54Z
(4:54 PM MT), after the photo-library picker fix (e9cf1c0) deployed.
**Added:** 2026-11-13

Feedback now accepts screen recordings (MP4, MOV or WEBM up to 200 MB) from the same Add
button (feedback cmwfkklis, from an iPhone). The video goes up in 3 MB parts through the app
and is stitched together in S3. It was tested end to end on the dev server against the live
bucket with a 7 MB test video, then deleted. NOT checked: picking a video in the feedback
panel by hand (Chrome could not reach that dev server), and a real iPhone recording.

**How to check it:** record your screen on the iPhone, open Feedback, choose **Add a
screenshot, photo or video** (label changed Nov 13), pick the recording from Videos in the photo
library and send it. Also a pass check: the photo library offers Videos, not only Photos and Files.

**What would count as a pass:** the button counts up to 100 percent, then the video plays
on Settings, Feedback.

---

### 80. View as has never been started or exited by clicking, on the live site

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Live site: View as on Alex Andrade, Rich Paden, Jonathan Schaedig and Kevin Sherman. Each landed on /candidates with the navy-and-gold bar and only their areas (Alex: 6 links; Kevin: 18). A DELETE while viewing returned 403 "You are viewing as another user, which is read-only." Exit returned to Team members as Aimee with viewAs null. Settings > Activity: "Started viewing as Alex Andrade (HIRING_MANAGER), read-only · 2:44 PM" and "Stopped viewing as Alex Andrade (exited) · 2:50 PM" (and the same pair from Nov 20). Not checked: on a phone.
**Added:** 2026-11-20

Settings > Team members has a **View as** button on every other person's row. It borrows
their identity, read-only, for up to 60 minutes, with a navy-and-gold bar at the top and an
**Exit View as** button. What WAS checked, on a local test server with real sign-in switched
on and a test session already in View as as a Hiring Manager: the session reported the Hiring
Manager instead of the admin; Settings, Reports and People refused them while Candidates
loaded; the sidebar shrank from five areas to their two; and every write (an API POST, a PATCH
and a server-action POST) came back 403 while the same PATCH as the plain admin got its normal
answer. NOT checked: pressing **View as** and **Exit View as** themselves. Both go through
next-auth's session update and write a line to the Activity log, and that log is the live
database. Also not checked on a phone, or in dark mode.

**How to check it, about two minutes:** on the live site open Settings > Team members, press
**View as** on someone with narrowed access, look around, then press **Exit View as**.

**What would count as a pass:** you land on their home page with the bar showing their name
and only their areas in the sidebar; trying to save anything says it is read-only; Exit takes
you back to Team members as yourself; Settings > Activity shows one "Started viewing as" and
one "Stopped viewing as" under your name.

---

### 79. The Values in Action department budgets have not been seen signed in on the live site, or in dark mode

**Status:** CLOSED 2026-11-21, by the sweep session on his instruction that day ("if they work, you can mark them as done"). Live site, signed in: Compliments > Budget shows Q4 2026, $4,375, 175 employees, 19 departments, each row naming who can spend it. Dark mode: screenshot readable; contrast scan found nothing under 3:1 on real text.
**Added:** 2026-11-19

Compliments > Budget (admin) now opens with each department's quarterly budget ($25 per
employee counted on the first day of the quarter, contractors and no-starts out) and who can
spend it. The recognition feed is switched off. The session checked the page over HTTP on
local dev (which skips sign-in) and at phone widths; the commit agent re-ran the numbers on
live data: Q4 2026, 175 people, $4,375, 19 departments, everyone with someone to spend it.
NOT checked: the page signed in on the live site, and dark mode.

**How to check it:** on the live site open Compliments > Budget, then switch to dark mode.

**What would count as a pass:** the department list shows the same totals ($4,375 for Q4
2026), each row names who can spend it, and everything is readable in dark mode.

---

### 76. Nobody has opened a sent contact card on a real phone yet

**Status:** CLOSED
**Closed:** 2026-11-19, by him: "Close 76"
**Added:** 2026-11-19

The Send contact card email now goes to people chosen in its dialog (linked supervisors
ticked, anyone else added by name or address) and carries an **Add to your contacts** button
to a no-login card page; the dialog also shows a QR code of that link. The session checked
the page and the .vcf over HTTP on local dev (both load; a wrong link shows nothing about
the person; no horizontal scroll at 375 light and dark) and built Raymond Cardenas's email
without sending it. NOT checked: scanning the QR and saving the contact on a real iPhone and
an Android phone (the link points at the live site, so it needs this deploy), and a real send.

**How to check it:** open a new hire's Send contact card dialog, scan its QR code with your
iPhone, tap Add to contacts, and save. If you can, try it on an Android phone too.

**What would count as a pass:** the phone offers Create New Contact (iPhone) or imports it
(Android), and the saved contact has the right name, title, phone and work email.

**Update 2026-11-19:** tested on phones after the deploy (email button, card page, Add to
contacts, and the QR code) and reported working: "it is great." Left open for him to close.

---

### 63. The new Post-onboard grid (Sample A) has not been used for real

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "please mark 63, 65, 66, 69, 70, 71, 72 as complete"
**Added:** 2026-11-14

The grid now shows days late (+43d) or "in 77d" instead of dates, every row is the same
height, Send sits under a late manager check-in, and on a phone each person is a card.
Checked in the in-app browser with live data at 1536, 1280, 1024, 768, 375 and 329 wide,
light and dark, with nothing saved. NOT checked: the two animations, because they only play
when something is really saved: marking a check-in done should draw its tick with one gold
ring, and sending a rating link should slide "sent" in under it. Also not checked on a real
iPhone.

**How to check it:** on the live site, mark one check-in done from its drawer and watch the
cell; send one rating link (Axel Leimer's 90-day is waiting for exactly that); then open
People > Post-onboard on your iPhone.

**What would count as a pass:** the tick draws itself and a gold ring fades; "sent" slides in
under the 90-day; on the phone every person is a card, nothing scrolls sideways, and the
A / T / C dropdown changes status.


---

### 65. Nobody has tapped a task on the New hires grid's phone cards

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "please mark 63, 65, 66, 69, 70, 71, 72 as complete"
**Added:** 2026-11-14

People > New hires > Checklist grid on a phone (below md) is now one card per hire: name,
position, start and orientation dates, status chip, progress bar, then the tasks grouped by
section (cb5f93d). Each task row is a button with the same cycle as the desktop cell
(to-do, done, N/A), hold words included, and reminder steps keep their email button.
Measured at 375 and 329, light and dark: nothing past the screen edge, no inner scrolling.
NOT checked: an actual tap, because every tap writes the live database. Not looked at on a
real iPhone either.

**How to check it:** on your iPhone, open People > New hires > Checklist grid, tap one task
on a hire to cycle it, then tap it back to where it was.

**What would count as a pass:** each person is a card with nothing scrolling sideways; a tap
moves the task to the next state and the progress bar and done count change with it; the
same task shows the same state on the desktop grid.

---

### 66. No interview guide has been used on a real interview yet, and none has been seen in dark mode

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "please mark 63, 65, 66, 69, 70, 71, 72 as complete"
**Added:** 2026-11-16

Interview Questions now builds guides (c17fd7f): tick questions in the bank or generate a
random set, save the guide to a candidate and one of their interviews, then on the guide
page type each answer, tap the core value chips the answer showed, rate it Strong /
Adequate / Weak / Did not answer, and see the Core values heard chart as Bars, Pie or
Numbers. The interview's scorecard sits underneath, and the guide shows on the interview
under Interview guides. He and the session checked it in a browser at desktop and phone
width. NOT checked: dark mode, and a guide linked to a real candidate's interview end to end
(no real candidate was touched). The commit agent read the live table on Nov 16: one guide,
his "Pilot Guide" (19 questions, no candidate, no answers).

**How to check it:** before or during a real interview, save a guide to that candidate and
interview; type a couple of answers, tap a chip and rate one; open the interview and find
the guide under Interview guides. Switch to dark mode and look at the guide page and the
chart.

**What would count as a pass:** the answers, chips and ratings are still there after a
reload; the chart counts match the chips; the interview shows the guide; everything is
readable in dark mode.

**Update 2026-11-16 (commit agent, read-only on the live database):** a second guide now
exists on a real candidate, Chase Anderson's "Interview Guide - PDP" (10 questions, 10
answered, 8 rated by Evaluate answers, one answer with an extra value ticked). It is linked
to the candidate but to NO interview yet, so the Interview guides section on an interview
still has nothing to show. Dark mode still not looked at.
Later the same day the guide was linked to his Recruiter Screen (Nov 16, Aimee Schaedig),
which also has a scorecard (Strong yes; Fueled by Passion Exceeds, the other three Meets);
all 10 answers are rated and confirmed by hand. So a guide is now on a real interview end
to end; dark mode is what is left.

---

### 69. The interview card's 8px value line and the reordered popup have not been seen in dark mode, and Accept all has not been pressed

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "please mark 63, 65, 66, 69, 70, 71, 72 as complete"
**Added:** 2026-11-16

From his review of Chase Anderson's interview. A candidate's interview card now shows the
four core value ratings from its scorecard at 8px beside the Scorecard button (no
recommendation, no points); the popup opens on the scorecard, then the interview guide,
with no write-up; each guide question shows the values its answer touched as gold chips;
and the guide page has **Accept all draft suggestions**. The session checked all of it on
Chase's real records, read-only, at her laptop width (1536) and on a phone. NOT checked:
dark mode, and pressing Accept all (it would have accepted the two drafts on his real
guide, so it was left for him).

**How to check it:** on Chase Anderson's guide press **Accept all draft suggestions**, then
open his interview popup. Switch to dark mode and look at his Interviews tab and the popup.

**What would count as a pass:** the "(draft)" labels are gone and stay gone after a reload;
the value line is readable in both light and dark.

**Update 2026-11-16 (his layout from dev tools):** the 8px line is replaced. Each value is now
two centred lines (name over rating) at the date's size (text-xs, 10.5px), evenly spaced, and
the Scorecard button has its icon on top, flush right, with the hover-only edit and delete
icons moved before the values. Checked in his Chrome at 1536 wide (11px top, right and
bottom; 17-18px between values) and on a phone; still NOT checked in dark mode.

---

### 70. A question marked "Not asked" has not been seen in the interview popup, or in dark mode

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "please mark 63, 65, 66, 69, 70, 71, 72 as complete"
**Added:** 2026-11-16

Each question on an interview guide has a **Not asked** button. It folds the question to one
grey line (always folded when the guide is reopened), hides its chips and rating, and leaves
it out of the evaluator, the core values chart and the answered count; **Mark as asked**
brings it back with anything typed. Checked by the session on localhost with a throwaway
guide (deleted after): both buttons clicked in the browser and read back from the database,
folded after a reload, and the evaluator judged only the asked answer. NOT checked: how a
skipped question looks in the interview popup (the sample guide was not linked to an
interview), and dark mode.

**How to check it:** on Chance Hanks's guide mark the questions you did not ask as Not asked,
then open his interview's popup from his Interviews tab.

**What would count as a pass:** each skipped question is one grey "Not asked" line in the
popup and on the guide page, and the core values chart counts only the asked answers.

---

### 71. Nobody has changed a candidate's status from Recent interviews yet

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "please mark 63, 65, 66, 69, 70, 71, 72 as complete"
**Added:** 2026-11-16

From Aimee's feedback cmwjv67c: Candidates > Recent interviews now has a Status column with
the same dropdown as the Candidates list, saving through the same route and shown only to
admins and recruiters (others see a plain pill). Checked by the session over HTTP on local
dev: the page loads, 11 dropdowns for 11 candidates, each showing its current stage. NOT
checked: changing a stage from the new dropdown (local dev writes the live database), and
the page on a phone (it already scrolled sideways there, and is now one column wider).

**How to check it:** on Recent interviews, change one candidate's status from the dropdown,
then open their profile.

**What would count as a pass:** the new status shows on the row after a reload and on their
profile, the same as a change made from the Candidates list.

---

### 72. Saved guides: nobody has saved, edited, used or added one yet

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "please mark 63, 65, 66, 69, 70, 71, 72 as complete"
**Added:** 2026-11-16

From Aimee's feedback cmwjxo24d: the Saved guides tab now lists only reusable guides (today
just the Pilot Guide, flagged as saved by the session); each opens to edit its questions or
use it for an interview, which copies it onto that interview and leaves the saved one as it
was; an interview has an Add a saved guide picker; and a used guide can be kept as a new
saved guide. The session checked the pages over HTTP only (each loads; the tab lists the
Pilot Guide alone; its editor shows 18 questions and names the deleted passion question).
NOT clicked: save, edit, use, add or keep, because each writes the live database; nor looked
at on a phone. The commit agent read the live data back on Nov 16: 3 guides, only the Pilot
Guide saved; Chase Anderson's and Chance Hanks's guides unchanged, with their answers.

**How to check it:** on Interview Questions > Saved guides, open the Pilot Guide, change one
question and save; then open an interview and add the Pilot Guide from Add a saved guide.

**What would count as a pass:** the edit sticks after a reload; the interview gets its own
copy with the questions the saved guide has now; the saved guide is still on the tab
unchanged by the interview; the earlier interviews' guides are unchanged.

---

### 74. Reports > Check-ins has not been opened in a browser, on a phone or in dark mode

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "i checked Reports > Check-ins, and Grace Ward’s profile > Check-ins and it works. mark it one. also mark 73 done"
**Added:** 2026-11-17

A new admin-only tab, Reports > Check-ins: every 3-, 6- and 12-month check-in rating,
including people already archived (until now nothing showed a rating once someone left
Post-onboard). It has the headline "would hire again" figure, four tiles, a "Talk to" list
(any score 1 to 3, a No to hire again, or Behind in the role), where each check-in stands,
ratings by manager, and every rating as a colored score row with the manager's note behind
a button. Checked by the session: it renders on the server with live data (18 ratings, 2 to
talk to, 7 managers, 8 notes, 20 profile links), the live Reports page carries the tab and
its data, and loading it leaves the rating-link store untouched. NOT checked: clicking the
tab and the 3-month / 6-month / 12-month filter, a note's button, a phone, dark mode.

**How to check it, two minutes:** Reports > Check-ins. Click each filter, open a manager's
note, then look at it on your phone and in dark mode.

**What would count as a pass:** the filters change the figures; notes open and close;
on a phone every rating is a card with its four scores in a row and nothing scrolls sideways.

---

### 75. A person's Check-ins tab has not been opened in a browser, on a phone or in dark mode

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "i checked Reports > Check-ins, and Grace Ward’s profile > Check-ins and it works. mark it one. also mark 73 done"
**Added:** 2026-11-17

Each person's profile (/people/<id>) has a new Check-ins tab, admins only (his call, Nov 17:
"Yes, on the profile"): one card per check-in at 3, 6 and 12 months. A rated one shows the
four scores in the form's colors, role progress, hire again, a "for HR to talk to" line and
the manager's note; an unrated one says Not rated yet, Marked not needed, or Ticked done
without a rating. It stays there after the person is archived. Checked by the session: it
renders on the server with live data for Grace Ward (follow-up, note), Elijah Hall (3-month
marked not needed, 6-month rated) and Scott Strahan (nothing rated), and the live page
/people/<Grace Ward>?tab=checkins carries the tab, its "1 of 3 rated" chip and the follow-up
line. NOT checked: clicking the tab, a phone, dark mode, and that a non-admin does not see it.

**How to check it, one minute:** open Grace Ward's profile, click Check-ins; then the same
on your phone and in dark mode. If you can, sign in as a non-admin and confirm the tab is
not there.

**What would count as a pass:** three cards, the rated one with its colored scores and note;
no sideways scroll on a phone; no Check-ins tab for a non-admin.

---

### 73. The interview PDF has only been printed by the session, headlessly, for one candidate

**Status:** CLOSED
**Closed:** 2026-11-17, by him: "i checked Reports > Check-ins, and Grace Ward’s profile > Check-ins and it works. mark it one. also mark 73 done"
**Added:** 2026-11-17

An interview can be printed or saved as a PDF: **PDF** in the interview popup (new tab) or
**Print or save as PDF** on the full interview page opens /interviews/&lt;id&gt;/print, a Letter
sheet with Include checkboxes (All, Scorecard, Interview notes, Interview guide; all on).
Page 1 is the header, the scorecard and the notes, with the notes' text shrunk (never below
8px) until they fit; the guide's asked questions start on page 2, Not asked ones left out.
Checked by the session on Chase Anderson only, by printing the page with headless Chrome
and reading the text of each page (4 pages; notes fitted at 10px; page 2 opens with the
questions), and by clicking every checkbox combination in Chrome. NOT checked: the print
dialog itself (Save as PDF and a real printer), a write-up long enough to hit the 8px floor,
an interview with more than one scorecard, and a phone.

**How to check it:** open an interview's popup, press **PDF**, then **Print or save as PDF**,
choose Save as PDF, and open the file. Try it once with a long write-up.

**What would count as a pass:** page 1 holds the header, scorecard and notes; questions
start on page 2; nothing is cut off; the file is named after the candidate and interview.

**Update 2026-11-17:** he tried it on the live site, through the real print dialog: "i tried
it and it worked." Still not tried: a write-up long enough to hit the 8px floor, an interview
with several scorecards, and a phone.

---

### 67. "Fill from transcript" on an interview guide has never been saved through, or opened on a phone

**Status:** CLOSED
**Closed:** 2026-11-16, by him: "close item 67. its working"
**Added:** 2026-11-16

The guide page has a **Fill from transcript** button: paste the interview transcript and
each question's answer is drafted in the candidate's own words, cleaned up, then shown in
a preview to tick, edit and save. Checked by the session: the drafting itself, on her real
"Interview Guide - PDP" questions with a made-up transcript, both directly and through the
live route on localhost (10 questions back, the 5 asked answered in first person with filler
removed and a follow-up folded in, a mention of a wife and new baby left out, the 5 not asked
left blank). NOT checked: pressing Save in the dialog (it writes to the live database, and no
real guide was touched), a REAL Granola transcript (the Granola connector does not hand out
transcripts on her plan), and the dialog on a phone or in dark mode.

**How to check it:** after a real interview, open its guide, press Fill from transcript, paste
the whole Granola transcript, look over the drafts, save them, then press Evaluate answers.

**What would count as a pass:** each saved answer sits under the right question after a
reload, reads like the candidate said it, adds nothing they did not say, and an answer you
had already typed was only replaced where you ticked it.

**Update 2026-11-16 (commit agent, read-only on the live database):** Chase Anderson's
"Interview Guide - PDP" now holds answers on all 10 questions and a rating on 8, set by
Evaluate answers, last changed 20:40 UTC; at 19:48 UTC it had none. So answers have been
saved through for real on one guide. Not known from the data: whether they came through Fill
from transcript or were typed, and whether they read right. The phone and dark mode checks are
still open.

---

### 64. Nobody has bulk-sent manager check-ins yet

**Status:** CLOSED
**Closed:** 2026-11-14, by him: "64 is done."
**Added:** 2026-11-14

People > Post-onboard: tick several people, choose **Send manager check-in** in the bulk bar,
pick 3-month, 6-month or 12-month, and Apply. A dialog groups them by supervisor, so each
manager gets ONE email with a link per person (subject and wording editable per email), and
shows who was left out and why (already sent, already rated, skipped, no supervisor email,
left). Checked in the in-app browser with live data and every send blocked: nine ticked
people split into Rich Paden (3 links), Harry Mitchel (2) and Chantil Hughes (1), with
Axel Leimer, Bryan Weber (links already out) and Elijah Hall (skipped) left out. NOT checked:
a real send, the email as the manager sees it, and the links opening.

**How to check it:** send one real bulk email to a manager with two or more people due (or
type yourself in as a test first), then open the email.

**What would count as a pass:** one email arrives with one "Rate [name]: 3-month check-in"
link per person; each link opens that person's form; after sending, each person's cell on
the grid shows "sent".

---

### 60. The phone layout and the Post-onboard table have not been looked at on a real iPhone or her laptop

**Status:** CLOSED
**Closed:** 2026-11-14, by him: "yes mark all of those items as done."
**Added:** 2026-11-13

Feedback cmwfo53k5 (new-hire page on her iPhone "look terrible") and cmwfsem9x (Post-onboard
table: no sideways scroll bar, header always visible). Phones now get a solid top bar
holding the menu, SOP and Feedback buttons, so the page scrolls under a bar instead of under
buttons floating on the text; the new-hire page's actions and tabs are even two-column grids;
and the Journey timeline runs down the page with its edit buttons always showing. The
Post-onboard table fits the width (Department, Started and Onboarded under the name) and its
header sticks to the top. Checked in a browser: at 1536 wide the page has no sideways scroll,
no cell spills, and after scrolling 1500px the header is on top; at 330 wide nothing
overlaps, the bar is what sits under the buttons once scrolled, and desktop still has the
side SOP tab and the sideways timeline. NOT checked: a real iPhone (Safari, its own address
bar and notch), dark mode on a phone (the preview renders light), and clicking in the table.

**How to check it, two minutes:** on the iPhone, open a new hire and scroll; on the laptop,
open People > Post-onboard, scroll down, and click a Rate and a tick.

**What would count as a pass:** on the phone nothing sits on top of text and the buttons
read in even rows; on the laptop there is no sideways scroll bar and the column names stay
visible while scrolling.

**Update 2026-11-13, from him:** "the iphone part is fine." The phone half is confirmed. The
Post-onboard table half is now covered by item 61, because the table was rebuilt to his
picked layout the same evening.

---

### 61. The rebuilt Post-onboard grid (his design #17) has not been used for real

**Status:** CLOSED
**Closed:** 2026-11-14, by him: "yes mark all of those items as done."
**Added:** 2026-11-13

He picked design #17 from the Post-onboard Designs page: columns grouped as One-time tasks
(Social, 401k), Check-ins (30-day, 60-day) and Manager check-ins (90-day, 6-month, 12-month,
each one column with the rating or link status under the tick); names turned sideways; a
small A / T / C status dropdown; a due-count row; space left on the right for future
columns; and every action in a drawer that opens from any cell. Checked in a browser at 1536
wide with every save blocked: no sideways scroll, nothing spills, about 250px left free on
the right, due counts 28 / 21 / 36 (60-day, 90-day, 6-month); picking T asks first and
nothing was sent when the answer was no; a cell opened Chris Sharpe's drawer with all seven
rows and their buttons; Escape closed it; a due manager Send opened the rating-link dialog;
all 576 controls carry the gold hover glow; light and dark both render. NOT checked: any real
save from the drawer (mark done, skip, send, rate), a real T (it archives the person), and
her laptop.

**How to check it, three minutes:** on People > Post-onboard, click a 30-day cell and mark it
done, then undo it; open a due 90-day cell and send a rating link to yourself as a test;
change someone's status to C and back to A.

**What would count as a pass:** each change shows in the grid without a reload and sticks
after one; the drawer's buttons do what the old grid's did; the Status letters change colour.

**Update 2026-11-14:** the drawer now has **Mark skipped** next to Mark done on every open
step, for older check-ins that should have happened before the check-ins existed ("I don't
want to mark them as done because they didn't happen"). It asks first, then the cell reads
N/A and the drawer reads "Skipped by (who) (date)"; Undo skip puts it back. Checked with
saves blocked: the button is on all six open rows of Chris Sharpe's drawer, and answering no
sent nothing. NOT checked: a real skip. Add to the check above: skip one old check-in, reload,
confirm it still reads Skipped, then Undo skip.

**Update 2026-11-14 (bulk):** the bulk bar now has **Mark check-in skipped**: tick people,
pick the check-in, Apply. It counts first, then asks ("Mark the 90-day check-in skipped for
5 people? ... 3 already done - left as they are"); only open steps change, each person gets
their own Skipped record, and anyone whose last open check-in it was is archived, as with
done. Checked with every write blocked (only the read-only count allowed through): five
people with the 30-day done got "Nothing to skip ... (5 already done)"; the same five on the
90-day got the question; answering no sent nothing. NOT checked: a real bulk skip. Add to
the check above: bulk-skip one old check-in for two people, reload, confirm both read
Skipped, then Undo skip on each from their drawer.

---

### 62. The core value definitions now use HR's wording — two of the three places were not opened

**Status:** CLOSED
**Closed:** 2026-11-14, by him: "yes mark all of those items as done."
**Added:** 2026-11-14

He sent HR's Core Values table (Definition | Key Behaviors) so the app's definitions match
HR's word for word. Each value now shows HR's first definition sentence, with a small More
that opens HR's whole definition and its Key behaviors (Less closes it). It is one shared
piece used in three places: the manager check-in rating form (the 1-10 form, also the
no-login link), the interview scorecard's core value rows, and the definitions under the
values picked on the Give recognition form. Checked in a browser: the rating form opened
from the Post-onboard drawer showed all four values with More, and More on Team Alignment
showed HR's full definition and all nine behaviors. NOT opened: the interview scorecard and
the recognition form, and a manager's phone on the no-login link.

**How to check it, two minutes:** open any interview and look at the Core values rows on the
scorecard; on Compliments, start a recognition and pick a value. Each should show one line
and a More that opens the rest. Compare one value against HR's table.

**What would count as a pass:** the text matches HR's table, and the page does not look busier
than before until More is clicked.

---

### 57. The 1–10 check-in ratings (90-day, 6-month, 12-month) have not been used by a real manager

**Status:** CLOSED
**Closed:** 2026-11-13, by him: "They're both done."
**Added:** 2026-11-13

His picks, Nov 13. The check-in rating is one form shared by the manager's link and
HR's dialog: four core values on a 1–10 scale (1 Does not meet, 2–3 Below the bar, 4–5
Can develop, 6–7 Meets, 8–9 Exceeds, 10 Sets the standard; red 1–3, amber 4–5, green
6–10), "Haven't seen it yet" per value, "How well has [name] learned their role so far?"
(Behind / On track / Ahead), and hire-again asked last. NO answer needs a reason (his
call: a required box makes supervisors switch to a higher score or Yes). The same form
now also runs at 6 months and 12 months: the post-hire checklist gained 6-month and
12-month check-ins, each with its own Rate and Send under its tick on Post-onboard, its
own rating, and its own link. Each score is also stored as its interview word, so
points and the interview comparison work as before.

Checked locally on throwaway TEST hires (all rows removed):
- a 1–3 and a No submit with no reason;
- a 6-month link says 6-month and "at 6 months", saves its own rating and ticks only the
  6-month check-in;
- HR's 12-month save ticks the 12-month check-in;
- a terminated person's 12-month link dies and the notice names the 12-month;
- the tab shows the new columns, with Rate and Send under 90-day, 6-month and 12-month.

The link page was looked at at phone width in the in-app browser, with a real tap.
NOT checked: HR's rating dialog was not opened on screen, and no real manager has used
the new form.

**How to check it, about three minutes:** after the deploy, open Post-onboard, press
**Send** under someone's 90-day (or 6-month) check-in, choose **Someone else** and
type your own address. Fill it in on your phone, picking a 2 and "Haven't seen it yet"
for one value, and send.

**What would count as a pass:** nothing asks you to explain the 2 or a No; after
sending, that check-in shows points, and the hover lists the 1–10 scores, "not seen" for
the skipped one, and the role answer; that check-in is ticked and the others are not.

---

### 55. The 90-day rating link has never been emailed to a manager, or opened by one

**Status:** CLOSED
**Closed:** 2026-11-13, by him: "They're both done." The live site had already shown it working: a rating link sent from production on Nov 12 to jonathan@skyshare.com (Jonathan Schaedig) was opened and submitted the same minute.
**Added:** 2026-11-11

Feedback cmwcq16o7: Post-onboard now has **Send to manager** under each person's Rate
button. It emails the hiring manager a no-login link (/rate/...) to that one person's
90-day form; the tab shows Sent / Completed / Expired / Cancelled, with resend (same link
or a new one) and cancel; and if the person is terminated, cancelled or archived first,
the link dies and a notice above the grid says why. Checked locally on a throwaway TEST
hire (20 checks, all passed, all test rows deleted): the form opens for that one person,
refuses an empty answer, takes one submission, saves the rating, ticks the 90-day check-in
done, refuses a second submission, shows Completed on the tab; a terminated employee's
link stops working and the notice lists them; and the send dialog opens on the real tab
with the supervisors filled in. NOT checked: **no email has gone out through it at all**
— the local test ran with sends BLOCKED, never redirected — so the Front send, how the
email looks in an inbox, and a link opened from a phone outside the app are all untested.
A local send would also refuse to build a localhost link for a real recipient, which is
why this waits for the deploy.

**How to check it, about three minutes:** on the live site, open People > Post-onboard,
press **Send to manager** on someone, choose **Someone else** and type your own address,
and send. Open the email on your phone, tap the link, rate, and send. Then reload
Post-onboard.

**What would count as a pass:** the email arrives with the link under the message; the
link opens a SkyShare page with only that person's form and no sidebar, without signing
in; after sending it says thank you; Post-onboard shows that person as Completed with a
rating in the Values column, and their 90-day check-in ticked. Opening the link again
says it has already been submitted. (It was your address, so it was a real test of a
real person's rating — re-rate them properly afterwards, or tell a session to remove it.)

---

### 33. The candidate page's layout has not been saved since the boxes started fitting their content

**Status:** CLOSED
**Closed:** 2026-10-26, by him: he saved the board in Edit layout on the live site. His words: "works as intended."
**Added:** 2026-10-26

The candidate Documents board now retires the Contact and Record boxes, and its left-column
boxes take their content's height outside Edit layout (feedback cmvpu6z6r). In Edit layout
they go back to their saved sizes. The code was read at commit time: measured heights only
shape the display and never reach the save. But **nobody has opened Edit layout and saved
since**, because a layout save rewrites the one shared layout everybody sees.

**How to check it:** as an admin, open any candidate, Edit layout, move one box slightly,
Save. Then reload two different candidates (one with many certificates, one with few).

**What would count as a pass:** the save succeeds, Contact and Record do not come back, the
left-column boxes still fit their content on both candidates with no box scrolling inside,
and nothing overlaps.

### 32. Nobody has saved an interview write-up or note in the new editor yet

**Status:** CLOSED
**Closed:** 2026-10-26, by him, NOT as a pass: he checked it on the live site and line spacing is still lost once a note is sent. His words: "still has issues. i made a new feedback message on it. so we can let that go for now. a working agent will work on it." The open work now lives in feedback cmvpxe5xt (and the roadmap entry, back to in progress).
**Added:** 2026-10-26

The interview and note editor was rebuilt on TipTap to stop indented bullets vanishing on
blur and blank lines vanishing on save (feedback cmvpiodds). The working session checked it
in a local browser without saving (the database is live): a typed document survived
sanitize and reopen unchanged, and all 77 stored write-ups and notes loaded with the same
text, bullets and headings. The server half was re-checked at commit time. **No save
through the live site has happened.**

**How to check it:** open a candidate's Interviews tab, edit a write-up, make an indented
bullet (Tab) and a blank line between two paragraphs, save, close, and reopen it.

**What would count as a pass:** the indented bullet and the blank line are still there
after reopening, and nothing else in the write-up moved.

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
