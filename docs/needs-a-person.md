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

## Closed

Nothing yet.
