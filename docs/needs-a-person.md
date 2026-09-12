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

**Status:** BLOCKED ON DEPLOY
**Added:** 2026-09-11

A note marked private is removed from the query rather than hidden in the page, so
it is absent from the network response and not merely invisible. That is the right
shape and it is the shape the code has. What has never happened is **somebody who
is not HR actually loading the page**: local dev bypasses auth, so every request
here runs as an admin and the non-HR branch cannot be exercised at all.

**How to check it, after this is deployed:** have somebody with a non-HR login —
a hiring manager, not Aimee, Hannah or Kevin — open a candidate who has a private
note on them, and confirm they cannot see it.

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

## Closed

Nothing yet.
