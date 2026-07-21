# SkyShare Talent-Ops SOPs

**This folder is the source of truth for every SOP.** Edit the HTML here, then republish —
the published pages are generated *from* these files, never the other way around.

> These lived in a session temp folder until 2026-07-20, which meant they could vanish
> between sessions. Keeping them in the repo makes them durable, version-controlled, and
> diffable against the code they describe.

## The book

| | File | Covers | Published |
|---|---|---|---|
| 📘 | `00-handbook.html` | **All SOPs as one book** — table of contents + a chapter each | https://claude.ai/code/artifact/e2f4c640-22fb-4be8-a3f4-243b5d3bde3d |

## The chapters (each shareable on its own)

| # | File | Covers | Published |
|---|---|---|---|
| 1 | `01-pre-onboarding.html` | The full journey: candidate → offer → onboarding board → onboarded | https://claude.ai/code/artifact/248592bd-8a62-4087-be52-5ea13eb50053 |
| 2 | `02-offers.html` | The six offer steps; moving people in *before* they sign | https://claude.ai/code/artifact/057d065a-78f7-4033-a3f0-6eeec9dd16d9 |
| 3 | `03-business-cards.html` | Ordering ahead of orientation + the six after-order steps | https://claude.ai/code/artifact/b52e49c2-bc88-4c4e-a6e3-366fb251261f |
| 4 | `04-org-charts.html` | Adding someone to a fleet card and linking their profile | https://claude.ai/code/artifact/3feb9260-c4e2-4dff-b888-63e8350e5b6e |

PDFs of each are generated on request into the user's `Downloads` folder.

## Updating an SOP

1. Edit the file here.
2. Republish it to the **same URL** (pass the existing artifact URL when publishing, so the
   link the team already has keeps working).
3. If the change affects the shared flow, update `00-handbook.html` too — the handbook is a
   separate document, not a concatenation, so it does **not** update itself.

## Keeping them true

SOPs rot when the app changes underneath them. Two habits keep these honest:

- **On request** — ask for an SOP check and every file here gets read against the current
  code, with a report of anything that no longer matches.
- **After a large change** — whenever a change lands that alters one of these workflows,
  flag it and offer to update the affected SOP *in the same batch*, rather than letting the
  drift accumulate. (Standing instruction from the user, 2026-07-20.)

Known drift risks to check first: the offer↔onboarding flow (Ch. 1 & 2), anything gated on
`ANTHROPIC_API_KEY` or the Front token, and the org-chart link behaviour (Ch. 4).
