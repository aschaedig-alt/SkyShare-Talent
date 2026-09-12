# Copy and content audit - 2026-09-11

Agent: r1-copy. Claim: `.claude/claims/r1-copy-afdc0817.md`.
Ran 2026-09-12 00:05-01:50 MT (this is the re-run after the session cap killed the
2026-09-11 23:10 MT attempt before it wrote anything). The audit keeps its
2026-09-11 name and directory, as asked.

Read-only throughout: no DB writes, no sends, no uploads, no git, no browser tool.
Two live reads were done with `SELECT`/`groupBy` only and are pasted below. One
scratch probe, `scripts/_r1-copy-probe.ts`, was used and deleted.

---

## Headline

**There are 2,605 matching lines of British spelling in the repo, but only about 513
are even candidates for change, and a mechanical find-and-replace would break five
separate things — one of them silently and invisibly to both `tsc` and ESLint.**

The worst case is `"unrecognised-subject"`. It is a string-literal union member
produced in `lib/paycom/notices.ts` and consumed in three other files, and one of
those consumers — `components/people/PaycomScanButton.tsx:149` — compares it against
a field its own local type declares as `outcome: string` (line 39), not as the union.
So if a spelling pass rewrites `notices.ts` and misses that component, **TypeScript
cannot catch it**: a `string === "literal"` comparison just becomes permanently
false. What stops working is the amber warning panel that lists Paycom emails the
app could not read — the guard the roadmap says exists precisely so a notice cannot
vanish quietly ("which is how the first version of this lost 33 notices",
`lib/roadmap/roadmap.ts:762`). It would fail closed-mouthed, which is the expensive
kind.

Four more that a blind pass gets wrong:

- **`grey` is a live design token, not a misspelling.** `tailwind.config.ts:22`
  defines `brand.grey: "#63666a"`, and `brand-grey` is used on **1,890 lines**. The
  served stylesheet contains `brand-grey` 24 times and `brand-gray` **zero** times,
  so respelling either the token or the usages — and missing the other — silently
  removes text colour across the app.
- **Google Calendar's own API value is British.** Eight `"cancelled"` literals in
  `lib/google/*` and `lib/interviews/debrief.ts` compare against Google's wire
  value. Americanising them stops the app ever noticing a cancelled event.
- **Both spellings are live in the production database at once** — proven below:
  `Interview.status` stores `"CANCELLED"`, `TravelTrip.status` stores `"CANCELED"`.
  21 `"CANCELLED"` literals are stored values and must not move.
- **`storey` is a surname.** All four hits are "Jessica Storey", two of them beside
  real email addresses.

The genuinely valuable result is much smaller and much safer than the raw count
suggests: **18 British spellings actually reach a human** (the in-app Handbook, two
aria-labels, a Front comment, an outbound email, a picker hint). Those are listed
individually under CERTAIN. The rest are comments, and the single biggest group is
an identifier that must not change at all.

Separately, the highest-value thing I found that is *not* a spelling: on
`components/candidates/ManageStageList.tsx`, one button's tooltip says **"No color"**
(line 161) and its aria-label says **"No colour"** (line 162). Same control, two
lines apart, two dialects.

---

## What I checked, and how

### Scope

1,024 files. `rg --files` over `app components lib scripts docs prisma types
artifacts` plus the 23 root-level `.md`/`.ts`/`.json` files, excluding
`node_modules`, `.next`, `.next-check`, `prisma/generated`, `public/vendor`,
`package-lock.json`, `tsconfig.tsbuildinfo` and `docs/audit-2026-09-11/**` (tonight's
own output — I may not edit a sibling's file, and I did read `visual.md`,
`time-date.md` and `lib/roadmap/roadmap.ts` for corroboration, noted where used).

```
$ rg --files <globs> <scope> | wc -l
1024
```

Per-directory: `app` 246, `components` 245, `lib` 270, `scripts` 159, `docs` 19,
`prisma` 49, root 23.

One honest scope note. `rg` respects `.gitignore`, and `find` shows 60 more files
under `scripts/` and 1 under `prisma/` than `rg` lists. I checked what they are —
`scripts/_paycom_intake_output/`, `scripts/out/`, `scripts/_reclassify_output/` and
two `.log` files, all gitignored scratch output. They are correctly excluded from a
fix list because they are not in the repo.

`lib/roadmap/roadmap.ts` is reported **separately** throughout. Its text renders as
the Command Center checklist, so its British spellings *are* user-visible — but only
the commit-and-push agent may edit that file, so they are not mine to list as fixes.
It accounts for 172 of the 2,605 matching lines.

### JOB 1 — the British-English sweep

I ran one `rg -iP` per token family with a per-family count, so a zero is
distinguishable from a broken pattern. 14 families returned hits and 14 returned
zero in the first pass alone:

```
### organis(e|es|ed|ing|ation|ations|ational|er|ers)  -> 6 hit(s)
### realis(e|es|ed|ing|ation)  -> 2 hit(s)
### recognis(e|es|ed|ing|able)  -> 55 hit(s)
### unrecognis(ed|able)  -> 29 hit(s)
### customis(e|es|ed|ing|ation|able)  -> 9 hit(s)
### optimis(e|es|ed|ing|ation)  -> 1 hit(s)
### prioritis(e|es|ed|ing|ation)  -> 0 hit(s)
### summaris(e|es|ed|ing|ation)  -> 5 hit(s)
### utilis(e|es|ed|ing|ation)  -> 0 hit(s)
### apologis(e|es|ed|ing)  -> 0 hit(s)
### authoris(e|es|ed|ing|ation)  -> 0 hit(s)
### categoris(e|es|ed|ing|ation)  -> 0 hit(s)
### minimis(e|es|ed|ing|ation)  -> 1 hit(s)
### maximis(e|es|ed|ing|ation)  -> 0 hit(s)
### normalis(e|es|ed|ing|ation|ations|er)  -> 26 hit(s)
### standardis(e|es|ed|ing|ation)  -> 0 hit(s)
### emphasis(e|es|ed|ing)  -> 0 hit(s)
### specialis(e|es|ed|ing|ation)  -> 0 hit(s)
### analys(e|es|ed|ing|er|ers)  -> 0 hit(s)
### paralys(e|es|ed|ing)  -> 0 hit(s)
### capitalis(e|es|ed|ing|ation)  -> 9 hit(s)
### initialis(e|es|ed|ing|ation)  -> 0 hit(s)
### synchronis(e|es|ed|ing|ation)  -> 0 hit(s)
### serialis(e|es|ed|ing|ation)  -> 7 hit(s)
### itemis(e|es|ed|ing)  -> 1 hit(s)
### finalis(e|es|ed|ing)  -> 0 hit(s)
### personalis(e|es|ed|ing|ation)  -> 3 hit(s)
### sanitis(e|es|ed|ing|ation)  -> 0 hit(s)
```

Note the deliberately narrow stems: `emphasis(e|ed|es|ing)` not bare `emphasis`
(the noun is correct), `specialis(e…)` not bare `specialis` (it would match
"specialist"), `analys(e…)` not `analysis`. All four returned zero, which is a real
zero and not a pattern that could never fire — the same command shape returned 55
for `recognis`.

Every other family, all with the same count-first shape:

```
### colour(s|ed|ing|less|ful)?  -> 122      ### licence(s|d)?  -> 6
### behaviour(s|al|ally)?  -> 62            ### defence(s|less)?  -> 2
### favourite(s|d)?  -> 0                   ### offence(s)?  -> 0
### honour(s|ed|ing|able)?  -> 16           ### pretence(s)?  -> 0
### labour(s|ed|ing)?  -> 0                 ### practise(s|d|ing)?  -> 0
### neighbour(s|ing|hood)?  -> 14           ### cancelled  -> 82
### rumour(s|ed)?  -> 0                     ### cancelling  -> 3
### flavour(s|ed|ing)?  -> 1                ### labelled  -> 45
### humour(s|ed|ous)?  -> 0                 ### labelling  -> 6
### endeavour(s|ed|ing)?  -> 0              ### modelling  -> 0
### vapour(s)?  -> 0                        ### modelled  -> 5
### armour(ed)?  -> 0                       ### travelling  -> 12
### centre(s|d)?  -> 5                      ### travelled  -> 1
### centring  -> 0                          ### traveller(s)?  -> 63
### (milli|centi|kilo)?metre(s)?  -> 0      ### marvellous  -> 0
### theatre(s)?  -> 5                       ### fuelled / fuelling  -> 0 / 0
### fibre(s)?  -> 0                         ### signalled  -> 0
### litre(s)?  -> 0                         ### grey(s|ish)?  -> 1928
### whilst  -> 0                            ### enrolment(s)?  -> 0
### amongst  -> 0                           ### fulfil / fulfils  -> 0 / 0
### programme(s|d)?  -> 3                   ### fulfilment  -> 0
### catalogue(s|d|ing)?  -> 3               ### instalment(s)?  -> 0
### dialogue(s)?  -> 0                      ### skilful(ly)?  -> 0
### judgement(s|al)?  -> 16                 ### wilful(ly)?  -> 0
### acknowledgement(s)?  -> 2               ### storey(s)?  -> 4
### ageing  -> 2                            ### aluminium  -> 0
### aeroplane(s)?  -> 1                     ### cheque(s)?  -> 0
### counsellor / counselling  -> 0 / 0      ### draught(s|y)?  -> 0
### totalled  -> 1                          ### kerb(s)?  -> 0
### totalling  -> 4                         ### plough(s|ed|ing)?  -> 0
### dialled / dialling  -> 0 / 0            ### tyre(s)?  -> 0
### levelled / levelling  -> 0 / 0          ### sceptical(ly)? / scepticism  -> 0 / 0
### manoeuvre / gaol / mould  -> 0          ### speciality / specialities  -> 0 / 0
### smoulder / sulphur / cosy  -> 0         ### pyjamas / tonne(s)?  -> 0
```

**Four of those are false positives and are NOT British.** I checked rather than
assumed: `cancellation(s)` (2), `enrolled` (4) and `enrolling` (0) are spelled the
same in American English, and `totalling`'s 4 hits turned out to be inside
roadmap prose. I dropped all of them from the fix list. `analysis` was never
flagged, as instructed, and `toward`/`towards` was not searched.

#### The catch-all pass, which found words the brief's list did not have

A prefix-blind token scan caught eleven more families my stem patterns had missed,
because stems like `\bcolour` do not match `recolour`:

```
$ rg -ioP '\b[a-z]{3,}isation(s|al)?\b' <scope> | sort | uniq -c
      4 capitalisation
      3 normalisation
      1 optimisation
      1 customisation

$ rg -ioP '\b[a-z]{4,}is(e|es|ed|ing)\b' <scope> | sort | uniq -c | sort -rn
    799 promise          <- correct in both, ignored
    163 otherwise        <- correct in both, ignored
     31 unrecognised
     29 recognised
     29 exercised        <- correct in both, ignored
     24 recognise
     19 advertised       <- correct in both, ignored
      ...
      5 recategorise
      3 centralised
      3 memoised
      2 canonicalise
      2 practising
      1 pressurised   1 parenthesised   1 parameterised
      1 idealised     1 generalises     1 denormalised
      1 materialising 1 alphabetising   1 americanised

$ rg -ioP '\b[a-z]{4,}our(s|ed|ing|al|able)?\b' <scope> | sort | uniq -c | sort -rn
     59 behaviour        10 recolour         4 onrecolour
     22 minnoticehours   10 neighbours       2 uncoloured
      ...                 1 seymour  1 mnassour  1 jacksoncseymour   <- NAMES
```

So `recolour`/`onRecolour`/`uncoloured` (17 occurrences) and the eleven `-ise`
words above are real and were added. `seymour`, `nassour`, `mnassour` and
`jacksoncseymour` are people's names and email addresses.

This is worth stating plainly: **my own first-pass patterns under-counted**, and
only the prefix-blind catch-all revealed it. A later agent should use the token list
in this file, not re-derive stems.

#### The live-data check: both spellings are in production right now

```
$ npx tsx scripts/_r1-copy-probe.ts        # groupBy only, no writes

--- Interview.status : distinct status values (whole table, no filter) ---
  "CANCELLED"  x2
  "COMPLETED"  x334
  "SCHEDULED"  x14

--- Booking.status : distinct status values (whole table, no filter) ---
  (zero rows in table)

--- OrientationSession.status : distinct status values (whole table, no filter) ---
  "UPCOMING"  x2
  "COMPLETE"  x4

--- TravelTrip.status : distinct status values (whole table, no filter) ---
  "CANCELED"  x1
  "BOOKED"  x2
  "COMPLETED"  x5

--- Event.status : distinct status values (whole table, no filter) ---
  "PLANNED"  x1
  "CONFIRMED"  x1

--- NewHire.canceled : Boolean column (American spelling in schema) ---
  canceled=false  x459
  canceled=true  x2
```

`Interview.status` = `"CANCELLED"` (British). `TravelTrip.status` = `"CANCELED"`
(American). Same concept, two spellings, both live. `Booking.status` came back empty
— that is a genuinely empty table, not a broken query, and the four tables around it
returning real values are the positive control. `NewHire.canceled` is the American
column the brief warned about, confirmed, and it is indexed
(`prisma/schema.prisma:428  @@index([employmentStatus, canceled])`).

Schema-side, the same split is documented in comments:

```
$ rg -n 'CANCELL?ED' prisma/schema.prisma
562:  status    String   @default("UPCOMING") // UPCOMING | COMPLETE | CANCELED
715:  // NEEDED | BOOKED | COMPLETED | CANCELED
1834:  status           String       @default("CONFIRMED") // CONFIRMED | CANCELLED
2004:  // PENDING | PLANNED | CONFIRMED | COMPLETE | CANCELED
```

And `lib/validation/interview.ts:25` pins the British one:
`status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).default("SCHEDULED")`.

#### Splitting `cancelled` into its three classes

```
cancelled (any case) OCCURRENCES, roadmap excluded: 85
  "CANCELLED" uppercase quoted  (STORED DB value - DO NOT CHANGE):   21
  CANCELLED uppercase unquoted  (comments/docs about it):             2
  "cancelled" lowercase quoted  (GOOGLE API value - DO NOT CHANGE):   8
  cancelled lowercase unquoted  (prose/comments - SAFE):             53
```

All eight lowercase literals, confirmed individually:

```
$ rg -n '"cancelled"' <scope>
lib\interviews\debrief.ts:147:    if (event.status === "cancelled") continue;
lib\google\booking-sync.ts:52:    status: booking.status === "CANCELLED" ? "cancelled" : "confirmed",
lib\google\interview-sync.ts:52:    status: (interview.status === "CANCELLED" ? "cancelled" : "confirmed") as "confirmed" | "cancelled"
lib\google\interview-sync.ts:170:      if (event.status === "cancelled") {
lib\google\calendar.ts:60:  status?: "confirmed" | "cancelled";
lib\google\calendar.ts:230:      if (event.status === "cancelled") continue;
lib\google\calendar.ts:534:    if (res.data.status === "cancelled") return null;
```

Every one is a comparison against Google Calendar's event status. `interview-sync.ts:52`
and `booking-sync.ts:52` are the translation line between the two dialects, which is
exactly the right design and must survive.

#### The house dialect is already decided, and it is American

This is not my inference — a previous session wrote it down.
`components/calendar/ScheduleInterviewForm.tsx:20-30`:

> Interview status options — friendly LABEL for display, raw enum `value` for the
> database. The stored strings keep the legacy British "CANCELLED" spelling that
> lib/validation/interview.ts and the Google sync both expect; only the label is
> Americanised, so Calendar now says "Canceled" like the Events module rather than
> putting both spellings on screen at once.

```
export const INTERVIEW_STATUSES = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  // "Canceled", one L, to match the spelling the Events and Travel modules
  // already use. The STORED value keeps the database's two-L enum.
  { value: "CANCELLED", label: "Canceled" }
] as const;
```

**That is the pattern every fix in this file follows: change the label, never the
stored value.** And it already holds app-wide — no user-visible label anywhere shows
the British spelling:

```
$ rg '"Cancelled"|>Cancelled<|Cancelled<' app components lib     # British
exit=1                                                           # genuine zero

$ rg '"Canceled"|>Canceled<|Canceled<' app components lib        # American, CONTROL
components\calendar\ScheduleInterviewForm.tsx:36:  { value: "CANCELLED", label: "Canceled" }
lib\travel\constants.ts:53:  { value: "CANCELED", label: "Canceled" }
lib\events\constants.ts:23:  { value: "CANCELED", label: "Canceled" }
components\people\OnboardingArchivedTab.tsx:25:  if (r.canceled) return { label: "Canceled", tone: "neutral" };
components\fleet\orgchart\TrainingTab.tsx:54:const CONFIRMATIONS: TrainingConfirmation[] = ["Confirmed", "Tentative", "Canceled", "Unknown"];
lib\fleet\staffing\training.ts:27:export type TrainingConfirmation = "Confirmed" | "Tentative" | "Canceled" | "Unknown";
  ... 21 hits total
exit=0
```

An earlier version of that probe returned empty for *both* spellings, which meant my
pattern was broken, not that the result was clean. I rewrote it until the control
fired. Noting it because a reader should be able to trust the zero above.

#### `grey`: 1,890 of 1,928 lines are a Tailwind class

```
$ cat tailwind.config.ts    (extract)
        brand: {
          ...
          // Secondary/metadata text. Darkened from the original #76787b (4.0:1 on
          // white — just under WCAG AA) to #63666a (~5:1) so small body text passes.
          grey: "#63666a",
```

Occurrence counts (`--count-matches`, not line counts):

```
grey  OCCURRENCES:  1957
  brand-grey:        1890
  brandColors.grey:     2
  --skyshare-grey:      3
  bare "GREY" quoted:  12
  tone="grey" union:   12
```

And it genuinely resolves — fetched from the running dev server, not assumed:

```
$ curl -s -o /tmp/layout.css -w "status=%{http_code} bytes=%{size_download}\n" \
    http://localhost:3000/_next/static/css/app/layout.css
status=200 bytes=153931

$ grep -o '[^,{}]\{0,40\}brand-grey[^,{}]\{0,60\}' /tmp/layout.css | sort -u | head
.bg-brand-grey
.bg-brand-grey\/15
.bg-brand-grey\/40
.border-brand-grey\/30
.decoration-brand-grey\/60
.disabled\:text-brand-grey:disabled
.empty\:before\:text-brand-grey\/70:empty::before
.fill-brand-grey
.placeholder\:text-brand-grey\/50::placeholder
  ... 24 occurrences of brand-grey

$ grep -c 'brand-gray' /tmp/layout.css
0
```

`brand-gray` generates no class at all. That is the whole risk in one number.

I also confirmed `colour` is **never** an identifier, with a control in the same
command — so unlike `grey`, every `colour` hit is prose:

```
$ rg -ioPn '(\bcolour\s*[:=]|\.colour\b|\bcolour\s*\?|<\s*colour|\{colour)' <scope>
scripts\seed-stage-colors.ts:44:(undo ? "CLEARING every stage colour:\n" : "Stage colours:\n")
  ^ the only hit, and it is a colon inside prose, not a key

$ rg -oPc '(\bcolor\s*[:=]|\.color\b)' <scope>      # CONTROL, American
665 identifier-shaped 'color' uses
```

#### `GREY` / `grey` as stored data, and the worst single line in the repo

```
$ rg -n '"GREY"' <scope>
prisma\seed.ts:77:    textColor?: "BLACK" | "LEA" | "EDEN" | "GREY" | "GOLD" | "RED" | "SWEET" | "CLOUD_DANCER";
lib\validation\blocks.ts:34:  "GREY",
lib\types.ts:24:  | "GREY"
lib\formatting\rich-text.ts:7:  { key: "GREY", label: "Grey", tag: "grey", value: brandColors.grey },
```

`lib/formatting/rich-text.ts:7` carries four different things on one line:

- `key: "GREY"` — the `InlineTextColor` value stored in `ContentBlockVersion.textColor`. **Do not change.**
- `tag: "grey"` — the bbcode tag in stored job-post bodies, `[color=grey]…[/color]`; `normalizeColor()` (line 30-34) matches by key *or* tag. **Do not change.**
- `label: "Grey"` — the user-visible picker label. Safe.
- `value: brandColors.grey` — identifier into `lib/formatting/brand.ts:8`. **Do not change.**

I checked whether those stored contracts are live, and the honest answer is that
they are **latent, not live**:

```
--- ContentBlockVersion.textColor : every stored value ---
  "LEA"  x20
  "BLACK"  x12
--- [color=TAG] in stored block bodies : 32 versions scanned, 2 carry at least one ---
  [color=lea]  x4
```

No row uses grey today. The positive control (`[color=lea]` x4, found in 2 of 32
scanned versions) shows the query works. So renaming `key`/`tag` would not corrupt
existing content *right now* — it would break the next piece of content authored in
grey, and it would break key/tag round-tripping if only one of the pair moved. Still
do not change them; just do not over-claim that data is at stake today.

#### The LLM JSON contract, inside a file full of British prose

`lib/extraction/travel-email-llm.ts` mixes a do-not-change contract with safe prose
in the same prompt string:

```
$ rg -n 'traveler_name|traveler_email' lib/extraction/travel-email-llm.ts lib/travel/*.ts
lib/extraction/travel-email-llm.ts:87:  traveler_name: string;
lib/extraction/travel-email-llm.ts:88:  traveler_email: string;
lib/extraction/travel-email-llm.ts:124:      "traveler_name", "traveler_email", "purpose", "segments", ...   <- required[]
lib/extraction/travel-email-llm.ts:129:      traveler_name: { type: "string" },                              <- properties
lib/extraction/travel-email-llm.ts:211:10. traveler_name is the person TRAVELLING, not the sender. The sender goes in
lib/extraction/travel-email-llm.ts:381:  if (!travel.traveler_name) warnings.push("No traveler named — ...");
lib/travel/match-traveler.ts:66:  const stated = travel.traveler_name.trim();
lib/travel/match-traveler.ts:107:    if (travel.traveler_email && norm(r.ssEmail) === norm(travel.traveler_email)) {
```

`traveler_name`/`traveler_email` are the tool-schema property names the model must
emit and the parser reads. **Do not change.** The surrounding prompt prose
("the TRAVELLER is SLEEPING", "GIVE THE TRAVELLER'S FULL NAME", lines 186/198/213/215)
is model input, not UI copy — safe to respell, but it is prompt text and a later
agent should know that is what it is touching.

#### `traveller` is entirely comments, except three places

All 49 non-roadmap `traveller` hits are comments or JSDoc, against a 4x larger
American control:

```
$ rg -ioPc '\btravellers?\b' <scope>   -> 49 non-roadmap        (British)
$ rg -ioPc '\btravelers?\b'  <scope>   -> 153 non-roadmap       (American, CONTROL)
$ rg -ioPn 'travell?er' prisma/schema.prisma
718:  // Request side — what the traveler needs (mirrors the pilot travel form).
734:  // Anyone travelling with the traveller (spouse, child, ...), by name
775:  // The traveller booked this one themselves (r
779: directly vs. what we owe the traveller back.
```

Not a Prisma field — all four schema hits are comments. The three that are *not*
comments are in CERTAIN below.

#### The in-app Handbook, verified over HTTP

`docs/sops/*.html` is read off disk by `lib/handbook/render.ts:88` and served into an
iframe, so its prose reaches real users. Seven British spellings:

```
$ rg -ioPn '.{0,55}\b(…|practis(e|es|ed|ing)|grey|labelled|…)\b.{0,40}' docs/sops/*.html
docs/sops/00-handbook.html:90:    <div class="stop"><b>Practising?</b> Tag the person <b>TEST</b> in the
docs/sops/00-handbook.html:157:  — labelled <b>Open seats</b> on crew, <b>Open posi
docs/sops/01-pre-onboarding.html:146:  <div class="watch"><b>Only practising?</b> Type <code>TEST</code> into <b>Tag
docs/sops/03-business-cards.html:150:  red field labels, grey title, black values, one block per card
docs/sops/03-business-cards.html:206:  except <b>Needed</b>, whose tab is labelled <b>Needs cards</b>
docs/sops/04-org-charts.html:201:  the counter at the bottom of each column — labelled <b>Open seats</b>
docs/sops/04-org-charts.html:219:  The bar at the top of the page has the same thing labelled <b>Save changes</b>
```

Confirmed served, not just present on disk:

```
$ curl -s -o /tmp/hb.html -w "status=%{http_code} bytes=%{size_download}\n" \
    http://localhost:3000/handbook/pre-onboarding/raw
status=200 bytes=25111
$ grep -o -i '.\{0,40\}practising.\{0,30\}' /tmp/hb.html
      <div class="watch"><b>Only practising?</b> Type <code>TEST</code> i
practising count in served HTML: 1
POSITIVE CONTROL: 2 x 'Benefits enrolled'
```

### JOB 2 — tone and label consistency

#### Action-verb labels

Extracted every `<button>` with a literal text child (50 buttons, 25 distinct
strings), then swept six verb families across quoted strings and JSX text in
`app components lib`. The families that matter:

```
Save|Update|Apply      -> "Save" 15, "Save changes" 9, "Save all changes" 5,
                          "Apply" 2, plus "Save requirement"/"Save scoring"/
                          "Save order"/"Save this location"/"Save this aircraft"
Delete|Remove|Archive  -> "Delete" 7, "Archive" 5, "Remove" 3 (+ 20 qualified forms)
Send|Email|Mail        -> "Email" 16, "Send email" 6, "Send" 1
Add|New|Create         -> "New" 20, "Add" 7
Edit|Change|Modify     -> "Edit" 8, "Edit all" 12
Cancel|Close|Dismiss   -> "Cancel" 30, "Close" 27, "Dismiss" 3
```

Two of those look like inconsistencies and are not. I checked rather than reported:

- **Send vs Email is not a real split.** All 16 bare `"Email"` strings are nouns —
  `placeholder="Email"`, a `field("Email", …)` label, and a CSV header
  `["Name", "Email", "Phone", …]` in `components/pilot-requirements/CandidateTriagePanel.tsx:23`.
  No button is labelled "Email" as a verb. Not a finding.
- **Save vs Save changes is defensible.** "Save" is used for a single field
  (`JobTitleField`, `PaycomReqField`, `JobDetailsFields`) and "Save changes" for a
  whole form (`CandidateProfileWorkspace`, `EditInterviewModal`, `InterviewWriteUp`).
  That is a distinction, not drift. Reporting it as a defect would be wrong.

What *is* real is the progress-label spelling, below, and two exact same-label
collisions:

```
$ rg -n 'Change Note|Change note' app components
components\content-blocks\BlockLibrary.tsx:1030:   <label className={labelClass}>Change Note</label>
components\pilot-requirements\PilotRequirementEditor.tsx:231:   <span …>Change note</span>

$ rg -n '"Edit Interview"|>Edit Interview<|Edit this interview' app components
components\calendar\EditInterviewModal.tsx:138:   <h2 …>Edit Interview</h2>
components\candidates\InterviewWriteUp.tsx:531:   aria-label="Edit this interview"
```

#### The ellipsis: 150 vs 61, and seven labels that exist in both spellings

The app's progress labels are written two ways. Measured across `app components`:

```
$ rg -oP '"[A-Z][^"]{1,40}…"'      app components | sort | uniq -c | sort -rn
     46 "Saving…"        10 "Sending…"      7 "Adding…"      5 "Scanning…"
      4 "Creating…"       3 "Reading…"      3 "Merging…"     3 "Applying…"
      2 "Working…"        2 "Uploading…"    2 "Deleting…"    2 "Checking…"
      ... TOTAL … strings: 150

$ rg -oP '"[A-Z][^"]{1,40}\.\.\."' app components | sort | uniq -c | sort -rn
     16 "Saving..."       2 "Working..."    2 "Saving draft..."
      2 "Saving block changes..."           1 "Sending..."
      1 "Uploading..."    1 "Scanning..."   1 "Creating..."   1 "Applying..."
      ... TOTAL ... strings: 61
```

House style is the ellipsis character `…` (150 of 211, 71%). Seven labels exist in
**both** spellings, so the same action renders differently depending on which screen
you are on: Saving (46 vs 16), Sending (10 vs 1), Scanning (5 vs 1), Creating (4 vs 1),
Applying (3 vs 1), Uploading (2 vs 1), Working (2 vs 2 — a dead tie).

The full 62-line fix list is in CERTAIN #2.

#### Heading case: measured, and the nav is the real story

```
=== HEADINGS h1-h3: 209 literal items ===
  single-word (not classifiable): 27
  Sentence case:                  160
  Title Case:                     22

=== BUTTONS (literal text child): 52 literal items ===
  single-word (not classifiable): 36
  Sentence case:                  16
  Title Case:                     0
```

Body headings are **88% sentence case** (160 of 182 classifiable) and buttons are
100% sentence case. So sentence case is the house style for prose headings.

But most of the 22 Title Case headings are not departures — they match their nav
entry. I checked the nav, and that is where the actual inconsistency lives:

```
$ rg -n 'label: "[^"]* [^"]*"' lib/navigation/modules.ts     (multi-word only)
TITLE  118  "Sourcing & Matching"      TITLE  238  "Imports / Uploads"
TITLE  122  "Pilot Requirements"       TITLE  239  "Duplicate Review"
TITLE  132  "Events & Outreach"        TITLE  241  "Historical Archive"
TITLE  140  "Interviews & Scheduling"  TITLE  257  "Command Center"
TITLE  146  "Debrief Queue"            TITLE  258  "Team Members"
TITLE  148  "Question Bank"            TITLE  263  "Layout Lab"
TITLE  155  "Job Post Builder"
TITLE  156  "Final Review"             sentence  185  "New hires"
TITLE  157  "Content Blocks"           sentence  188  "Business cards"
TITLE  217  "Crew Org Chart"           sentence  224  "Fleet positions"
TITLE  218  "Maintenance Org Chart"    sentence  262  "Block management"
                                       sentence  264  "New hire contacts"
```

17 Title Case against 5 sentence case. And it is visible in a single glance, because
four of them sit in one `items: []` array — the Settings menu,
`lib/navigation/modules.ts:256-264`, in reading order:

```
General                 (single)
Command Center          TITLE      <- locked proper noun (CLAUDE.md names this page)
Team Members            TITLE      <- generic; the outlier
Activity                (single)
Feedback                (single)
Templates               (single)
Block management        sentence
Layout Lab              TITLE      <- locked proper noun (Jul 9 decision, stays)
New hire contacts       sentence
```

So a user opening Settings reads Title, Title, sentence, Title, sentence. With
"Command Center" and "Layout Lab" excluded as locked names, **"Team Members" is the
one genuine outlier in that group** — that is CERTAIN #4. The wider question of which
convention the other 16 should follow is a naming decision and is in UNCERTAIN.

#### Empty states: 117 guards, and I could not confirm a single missing one

I measured this twice because my first method was wrong, and the second method is
still only a heuristic.

First pass: 56 components render a list (a `.map()` emitting `<tr>` or `<li>`). Three
appeared to have no empty state at all. **All three are false positives** — I read
them, and each iterates a fixed constant that can never be empty:

```
components/candidates/DocumentChecklist.tsx:46   CHECKLIST.map(...)   <- const CHECKLIST (line 10)
components/candidates/OfferControl.tsx:192,219   OFFER_STATUSES.map / OFFER_STEPS.map
components/settings/ModuleVisibilityAccessPanel.tsx:223,231,241   roles.map / groupedRows.map  <- nav registry
```

Second pass, on the actual empty branches — 117 zero-length guards:

```
zero-length guards found:        117
  with visible empty-state copy: 100
    ...offering a next action:    36
    ...bare message only:         64
  guard with NO visible copy:     17
```

I then read four of the 17 "no visible copy" cases, and **all four have a perfectly
good empty state** my extractor could not see — it was behind a prop
(`components/compliments/Leaderboard.tsx:30` renders `{emptyText}`), in a deeper JSX
node (`components/interviews/InterviewDetailWorkspace.tsx:292-298` has an icon, a
heading "No scorecards yet" and "Add the first interviewer's scorecard above."), or
used curly quotes (`components/new-hire-contacts/ContactPicker.tsx:95`,
`components/fleet/orgchart/PeopleIndex.tsx:150`).

**So the honest answer is that I cannot name a list in this app that lacks an empty
state, and the three-way split above is not trustworthy enough to publish as fact.**
The 36/64 action-vs-bare split is wrong in at least one direction I can demonstrate:
`components/fleet/orgchart/TrainingTab.tsx:360` is filed as "bare" but its copy is
"No training records yet — import the tracking sheet above.", which plainly offers a
next action; my pattern only matched a capitalised "Import". Treat the numbers as a
starting point for a human, not a finding. The empty-state copy itself is good —
examples like "Nobody found. Check the spelling, or search a different part of the
name." (`components/fleet/orgchart/LinkPicker.tsx:136`) and "No match. If they aren't
in the app yet, type their name and email in the fields below instead."
(`components/people/SupervisorPicker.tsx:132`) are better than most apps manage.

#### Error copy that can leak internals

```
$ rg -c '(setError|setMessage|setStatus|alert|toast)\(…(String\((e|err|error)|\.message|\.stack)' app components
63 occurrences

$ rg -c '(message|error):\s*…((String\((e|err|error)|(e|err|error)\.message|\.stack)' app/api
27 occurrences
```

The pattern is always `e instanceof Error ? e.message : "friendly fallback"`. The
fallbacks are good copy ("Could not rename that tag.", "Unable to save branding.").
The problem is the `true` branch: the catch blocks do not distinguish an
app-authored validation error from a runtime or Prisma one.
`app/api/onboarding-milestones/route.ts` is the clearest case — three blanket catches
returning `error.message` verbatim with status 400:

```
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to add milestone." }, { status: 400 });
  }
```

and the function it wraps throws friendly errors *and* does four Prisma operations:

```
lib/data/onboarding-milestones.ts:59   if (!trimmed) throw new Error("Milestone name is required.");
lib/data/onboarding-milestones.ts:61   if (cat.length >= 40) throw new Error("You can have up to 40 milestones.");
lib/data/onboarding-milestones.ts:63   await writeCatalog(...)
lib/data/onboarding-milestones.ts:78   await prisma.newHire.findMany(...)
lib/data/onboarding-milestones.ts:86   await prisma.onboardingTask.aggregate(...)
```

So the same `message` field carries "Milestone name is required." and, if the
database misbehaves, whatever Prisma put in `error.message` — which names the model
and the invocation. I am **not** claiming this has happened; I did not and would not
trigger it. What I can state from reading the code is that nothing filters it. See
UNCERTAIN #1.

On the narrower checks:

- **The literal word "undefined" never appears in user-visible copy.** 14 hits, all
  `: undefined` as a JavaScript value in `style`/`aria-live` props
  (e.g. `components/candidates/CandidateFileUploadButton.tsx:127`). Clean.
- **No stack traces, no Prisma error codes (P2002 etc.) and no table names appear in
  any hardcoded user-facing string.**
- **`TODO` is domain vocabulary, not a leaked code comment.** It is a stored status
  (`TODO | DONE | NA`) across the onboarding checklist, and the UI shows the friendly
  label: `components/people/OnboardingHistoryPanel.tsx:320` renders
  `<option value="TODO">To do</option>`. Do not "clean up" these.
- **No placeholder or filler text anywhere**, with a control in the same command:

```
$ rg -icn 'lorem ipsum|dolor sit|asdfgh|test123' app components lib   -> filler hits: 0
$ rg -icn 'candidate' app components lib                             -> 5187 lines (CONTROL)
```

- **One "coming soon" string, and it is legitimate** —
  `components/new-hire-contacts/NewHireContactsView.tsx:62` is the
  `totalContacts === 0` empty state, not stale copy on a shipped feature. But the
  heading contradicts its own body: the `<h1>` says "Contacts coming soon" (reads as
  "the feature is not built") while the line underneath says "Your SkyShare contacts
  haven't been set up yet." A new hire sees this on the token-gated `/welcome` page.
  CERTAIN #9.

#### Date and number formats in prose

Dates are in good shape and I want to say so plainly rather than manufacture a
finding. `lib/dates/display.ts` exports 20 shared formatters and there are only two
inline `toLocaleDateString` calls in the entire repo.

Three locales are in use, which looked like drift and is not:

```
$ rg -oP 'Intl\.DateTimeFormat\([^)]{0,140}' app components lib | sort | uniq -c
     27 Intl.DateTimeFormat("en-US", {     8 Intl.DateTimeFormat("en", { month: "short", …
      5 Intl.DateTimeFormat("en-CA", {     ...
```

- Every `en-CA` use is deliberate `YYYY-MM-DD` **day-key** generation, documented in
  the code itself (`lib/dates/display.ts:147` "en-CA gives yyyy-mm-dd, which is
  exactly the shape we need back"; `lib/orientation/reminder.ts:33` "en-CA gives
  YYYY-MM-DD"). Never user-facing.
- `en` vs `en-US` renders **identically**, verified rather than assumed:

```
$ node -e '...'
en    : Sep 12, 2026
en-US : Sep 12, 2026
same  : true
en-CA (no opts): 2026-09-12
```

  So that split is a code-tidiness nit, not a user-visible inconsistency. Not a
  finding for this section. (Timezone correctness is `time-date.md`'s, not mine.)

**Money is where the real format inconsistency is.** Five formatters, and I computed
what each actually renders rather than reading the options:

```
FORMATTER                                           1234        1234.5      45000
app/compliments/budget/page.tsx:11 usd0             $1,234      $1,235      $45,000
app/compliments/budget/page.tsx:12 usd2             $1,234.00   $1,234.50   $45,000.00
lib/travel/constants.ts:123 formatUsd               $1,234.00   $1,234.50   $45,000.00
lib/data/onboarding.ts:373 money                    $1,234.00   $1,234.50   $45,000.00
components/travel/TravelSpendYear.tsx:33 compactUsd $1.2K       $1.2K       $45K
```

Three of the five produce identical output — that is duplication, not inconsistency,
and `compactUsd` is a documented axis label ("$4.5K — short enough for an axis label
at 11px"). The genuine defect is on one page, in two **adjacent rows**:

```
$ rg -n 'usd0|usd2' app/compliments/budget/page.tsx
 96:  <Row label="Projected monthly spend" value={usd2.format(b.projectedMonthlyUsd)} />   -> $1,234.00
 97:  <Row label="Projected annual spend"  value={usd0.format(b.projectedAnnualUsd)} />    -> $45,000
100:  <Row … value={usd2.format(b.projectedMonthlyAwardedUsd)} />
103:  <Row … value={usd2.format(b.liabilityPerPersonUsd)} />
104:  <Row … value={usd2.format(b.awardedPerPersonUsd)} />
```

Line 97 is the only `usd0` inside that `Row` list; 96, 100, 103 and 104 all use
`usd2`. CERTAIN #3. (The `usd0` uses on lines 53-74 and 165 are the big MetricCards
and the monthly bar list, where dropping cents is a deliberate and reasonable choice
— leave those.)

---

## CERTAIN - safe for a later agent to fix without re-deriving

Every item below has an exact before and after. Nothing in this section touches a
stored value, a third-party field, an identifier, or `lib/roadmap/roadmap.ts`.

### 1. A duplicated alternative in the venue-matching regex

`lib/events/parse-event-email.ts:207` lists `centre` **twice**.

Before:
```
    /\b(airport|hangar|center|centre|centre|college|university|school|hotel|conference cent|convention cent|campus|fbo|terminal|arena|fairgrounds|pavilion|ballroom)\b/i;
```
After (delete one `centre|`, keep the other):
```
    /\b(airport|hangar|center|centre|college|university|school|hotel|conference cent|convention cent|campus|fbo|terminal|arena|fairgrounds|pavilion|ballroom)\b/i;
```
Harmless today (it is an alternation), but it reads as a typo and invites someone to
"fix" it the wrong way. **Do not Americanise the surviving `centre`** — this regex
matches inbound email text and a real venue may be spelled "Conference Centre".

### 2. 62 progress strings using `...` instead of the house `…`

Replace the three ASCII periods with a single `…` (U+2026) in each string below.
House style is `…` by 150 to 61, and seven of these labels already exist in both
spellings. Nothing here is a stored value or a key.

```
components\auth\GoogleSignInButton.tsx:32                 "Opening Google..."
components\calendar\EditInterviewModal.tsx:343            "Saving..."
components\calendar\ScheduleInterviewForm.tsx:94          "Scheduling interview..."
components\calendar\ScheduleInterviewForm.tsx:344         "Scheduling..."
components\candidates\ApplicationNote.tsx:98              "Saving..."
components\candidates\CandidateFileUploadButton.tsx:122   "Uploading..."
components\compliments\GiveRecognitionForm.tsx:116        "Share what made this special. Be specific about the impact..."
components\compliments\GiveRecognitionForm.tsx:160        "Sending..."
components\compliments\PersonPicker.tsx:85                "Search by name or role..."
components\compliments\ProgramSettingsForm.tsx:131        "Saving..."
components\content-blocks\BlockLibrary.tsx:324            "Saving block changes..."
components\content-blocks\BlockLibrary.tsx:326            "Duplicating block..."
components\content-blocks\BlockLibrary.tsx:328            "Applying block to jobs..."
components\content-blocks\BlockLibrary.tsx:666            "Duplicating..."
components\content-blocks\BlockLibrary.tsx:747            "Search name, category, scope, placement..."
components\content-blocks\BlockLibrary.tsx:866            "Saving..."
components\content-blocks\BlockLibrary.tsx:1118           "Saving..."
components\content-blocks\BlockLibrary.tsx:1207           "Applying..."
components\duplicate-review\CandidateDuplicateScanCard.tsx:270  "Scanning..."
components\final-review\FinalReviewWorkspace.tsx:124      "Search title, department, location..."
components\imports\CandidateCsvImportCard.tsx:82          "Importing candidates..."
components\imports\ImportActionCards.tsx:256              "Saving uploaded file records..."
components\imports\ImportActionCards.tsx:326              "Uploading files..."
components\imports\ImportActionCards.tsx:330              "Uploading files to private storage..."
components\imports\ImportActionCards.tsx:358              "Importing jobs..."
components\imports\ImportActionCards.tsx:453              "Saving parsed job rows..."
components\imports\ImportActionCards.tsx:496              "Extracting PDFs..."
components\imports\ImportActionCards.tsx:500              "Extracting PDF text and preparing job rows..."
components\imports\ImportActionCards.tsx:552              "Importing catalog..."
components\job-editor\JobBlockAssembly.tsx:417            "Saving block to this job..."
components\job-editor\JobBlockAssembly.tsx:442            "Removing block..."
components\job-editor\JobBlockAssembly.tsx:462            "Saving linked version..."
components\job-editor\JobBlockAssembly.tsx:484            "Saving block changes..."
components\job-editor\JobBlockAssembly.tsx:533            "Saving new block order..."
components\job-editor\JobBlockAssembly.tsx:589            "Saving..."
components\job-editor\JobBlockAssembly.tsx:605            "Search blocks..."
components\job-editor\JobDataEditor.tsx:267               "Saving draft..."
components\job-editor\JobDataEditor.tsx:307               "Saving..."
components\job-editor\JobDataEditor.tsx:351               "Search title, department, location..."
components\job-editor\JobDataEditor.tsx:412               "Working..."
components\job-editor\JobDataEditor.tsx:587               "Saving..."
components\job-editor\JobsSandboxWorkspace.tsx:459        "Saving draft..."
components\job-editor\JobsSandboxWorkspace.tsx:506        "Archiving role..."   AND   "Restoring role..."
components\job-editor\JobsSandboxWorkspace.tsx:1261       "Saving..."
components\job-editor\JobsSandboxWorkspace.tsx:1335       "Search jobs..."
components\job-editor\JobsSandboxWorkspace.tsx:1661       "Search shared blocks..."
components\job-preview\JobExportMenu.tsx:128              "Copying basic HTML..."
components\job-preview\JobExportMenu.tsx:139              "Copying formatted post..."
components\job-preview\JobExportMenu.tsx:150              "Opening PDF print view..."
components\orientation\OrientationOverview.tsx:418        "Creating..."
components\people\NewHireDetailWorkspace.tsx:1015         "Saving..."
components\people\NewHireDetailWorkspaceClassic.tsx:427   "Saving..."
components\people\PreOnboardingWorkspace.tsx:189          "Adding..."
components\pilot-requirements\PilotRequirementEditor.tsx:167  "Saving..."
components\pilot-requirements\PostingCheckPanel.tsx:96    "Reading the posting..."
components\recruiting-jobs\JobClassificationEditor.tsx:89 "Saving..."
components\settings\BlockManagementWorkspace.tsx:99       "Search blocks..."
components\settings\BlockManagementWorkspace.tsx:202      "Working..."
components\settings\BrandingPanel.tsx:154                 "Saving..."
components\settings\ModuleVisibilityAccessPanel.tsx:201   "Saving..."
components\settings\UsersManagementWorkspace.tsx:433      "Saving..."
components\shared\RichTextEditor.tsx:158                  "Type content..."
```

### 3. Two adjacent money rows in two different formats

`app/compliments/budget/page.tsx:97` is the only `usd0` in a `Row` list where 96, 100,
103 and 104 all use `usd2`.

Before: `<Row label="Projected annual spend" value={usd0.format(b.projectedAnnualUsd)} />`
After:  `<Row label="Projected annual spend" value={usd2.format(b.projectedAnnualUsd)} />`

Leave the `usd0` uses on lines 53, 56, 59, 64, 74 and 165 alone — those are the
MetricCards and the monthly bar list, where dropping cents is deliberate.

### 4. One nav label out of step with its own menu

`lib/navigation/modules.ts:258`.

Before: `{ id: "settings", href: "/settings/users", label: "Team Members", icon: Users },`
After:  `{ id: "settings", href: "/settings/users", label: "Team members", icon: Users },`

Rationale: in that one `items: []` array, "Block management" (262) and "New hire
contacts" (264) are sentence case, and the only other Title Case entries are
"Command Center" (257) and "Layout Lab" (263), both locked proper nouns. "Team
Members" is the generic outlier.

The two page headings that mirror it should move with it, or they will contradict the
nav:

- `app/settings/users/page.tsx:114` — `Team Members` -> `Team members`
- `components/settings/UsersManagementWorkspace.tsx:263` — `Team Members` -> `Team members`

### 5. One button whose tooltip and screen-reader label disagree on spelling

`components/candidates/ManageStageList.tsx`, lines 161 and 162, on the same button.

```
161:   title="No color — fall back to the keyword guess"       <- American
162:   aria-label={`No colour for ${s.value}`}                 <- British
```

After: ``aria-label={`No color for ${s.value}`}``

### 6. The second aria-label with a British spelling

`components/candidates/CandidateTagEditor.tsx:266`.

Before: ``aria-label={`Change the colour of ${tag.label}`}``
After:  ``aria-label={`Change the color of ${tag.label}`}``

### 7. Two labels in Title Case where the same phrase is sentence case elsewhere

- `components/content-blocks/BlockLibrary.tsx:1030` — `<label …>Change Note</label>`
  -> `Change note`, matching `components/pilot-requirements/PilotRequirementEditor.tsx:231`.
- `components/calendar/EditInterviewModal.tsx:138` — `<h2 …>Edit Interview</h2>`
  -> `Edit interview`. The app's other edit affordances are sentence case
  ("Edit note", "Edit role", "Edit candidate", "Edit card", "Edit layout"), and the
  sibling write-up control already says "Edit this interview"
  (`components/candidates/InterviewWriteUp.tsx:531`).

### 8. The 18 British spellings that reach a human

These are the ones worth the user's attention. None is a key, a stored value or an
identifier; I read every line to confirm it is rendered text.

| # | File:line | Current | Replace with | Where it is seen |
|---|---|---|---|---|
| 8.1 | `docs/sops/00-handbook.html:90` | `<b>Practising?</b>` | `<b>Practicing?</b>` | Handbook Ch. 0 (in-app) |
| 8.2 | `docs/sops/00-handbook.html:157` | `labelled <b>Open seats</b>` | `labeled <b>Open seats</b>` | Handbook Ch. 0 |
| 8.3 | `docs/sops/01-pre-onboarding.html:146` | `<b>Only practising?</b>` | `<b>Only practicing?</b>` | Handbook Ch. 1 (HTTP-verified above) |
| 8.4 | `docs/sops/03-business-cards.html:150` | `grey title` | `gray title` | Handbook Ch. 3 |
| 8.5 | `docs/sops/03-business-cards.html:206` | `whose tab is labelled` | `whose tab is labeled` | Handbook Ch. 3 |
| 8.6 | `docs/sops/04-org-charts.html:201` | `— labelled <b>Open seats</b>` | `— labeled <b>Open seats</b>` | Handbook Ch. 4 |
| 8.7 | `docs/sops/04-org-charts.html:219` | `the same thing labelled` | `the same thing labeled` | Handbook Ch. 4 |
| 8.8 | `app/candidates/manage/page.tsx:139` | `<strong>recategorise</strong>` | `<strong>recategorize</strong>` | Candidates > Manage, body text |
| 8.9 | `lib/matching/position-skip.ts:33` | `hint: "A judgement call about this role only"` | `"A judgment call about this role only"` | skip-reason hint, Matchboard |
| 8.10 | `lib/candidates/aircraft-types.ts:75` | `pressurized: "Pressurised endorsement"` | `pressurized: "Pressurized endorsement"` | type-rating label. **Keep the `pressurized` key** — it matches resume text |
| 8.11 | `lib/travel/from-email.ts:181` | `Could not confidently identify the traveller.` | `…the traveler.` | posted as a **Front comment** on a real thread (line 186) |
| 8.12 | `lib/travel/gaps.ts:115` | `show on the traveller's calendar until a date is set.` | `traveler's` | travel-gap `detail` on the trip panel |
| 8.13 | `lib/pilotapp/daily-email.ts:60` | `only the labelling was skipped.</p>` | `only the labeling was skipped.</p>` | **outbound daily email** to the team |
| 8.14 | `components/candidates/ManageStageList.tsx:162` | `No colour for` | `No color for` | aria-label (same as CERTAIN #5) |
| 8.15 | `components/candidates/CandidateTagEditor.tsx:266` | `Change the colour of` | `Change the color of` | aria-label (same as CERTAIN #6) |
| 8.16 | `app/api/disposition-reasons/route.ts:58` | `Recategorised ${changed.length} disposition wording…` | `Recategorized …` | ActivityLog `description`, shown on the Activity dashboard. Only affects new rows; existing rows keep the old spelling |
| 8.17 | `lib/tags/colors.ts:15` | `label: "Grey"` | `label: "Gray"` | tag colour-picker label. **Keep `value: "slate"`** |
| 8.18 | `lib/formatting/rich-text.ts:7` | `label: "Grey"` | `label: "Gray"` | job-post colour picker. **Keep `key: "GREY"` and `tag: "grey"`** |

8.17 and 8.18 carry a trade-off worth one sentence: the brand token is spelled
`brand-grey`, so Americanising only the visible label makes the label and the token
differ. I still recommend it — the label is the only part a user reads — but if the
user would rather keep label and token aligned, skip those two and nothing else in
this file changes. That choice is his, not a later agent's.

### 9. A heading that contradicts its own body

`components/new-hire-contacts/NewHireContactsView.tsx:62`. A new hire sees this on
the token-gated `/welcome` page when no contacts are configured.

Before:
```
<h1 …>Contacts coming soon</h1>
<p …>Your SkyShare contacts haven&rsquo;t been set up yet. Check back shortly.</p>
```
After:
```
<h1 …>Your contacts aren&rsquo;t ready yet</h1>
<p …>Your SkyShare contacts haven&rsquo;t been set up yet. Check back shortly.</p>
```
"Coming soon" says the feature is unbuilt; it shipped. What is missing is the data,
which is what the second line already says.

### 10. British spellings in comments, JSDoc and developer-facing docs

Safe, zero runtime risk, and genuinely large: **313 matching lines** outside
`roadmap.ts`, `grey` and the do-not-change set. They are not listed individually
because the token list below plus the exclusion table is enough to apply them
mechanically, and because a reviewer's attention is better spent on items 1-9.

Token list for a bulk comment pass:

```
organis* realis* recognis* unrecognis* customis* optimis* summaris* minimis*
normalis* denormalis* capitalis* serialis* itemis* personalis* recategoris*
centralis* canonicalis* memois* parenthesis(e|ed|ing) parameteris* pressuris*
idealis* generalis* materialis* alphabetis* americanis* practis(e|es|ed|ing)
colour* recolour* uncoloured behaviour* honour* neighbour* flavour* centre(s|d)
theatre(s) licence(s|d) defence cancelled cancelling labelled labelling
travelling travelled traveller(s) modelled totalled programme(s|d) judgement*
acknowledgement(s) ageing aeroplane(s)
```

**It must be run with the exclusion list in the next section, or it breaks the app.**

---

## DO NOT CHANGE - the exclusion list any bulk pass must carry

Each row says why, because the reason is what stops someone undoing it later.

| What | Count | Why it must not move |
|---|---|---|
| `brand-grey` Tailwind class | 1,890 lines | Generated from `tailwind.config.ts:22 grey: "#63666a"`. Served CSS has `brand-grey` x24, `brand-gray` x0. Renaming either side and missing the other silently removes text colour |
| `tailwind.config.ts:22` `grey: "#63666a"` | 1 | The token definition itself |
| `app/globals.css:12` `--skyshare-grey` | 1 | CSS custom property |
| `lib/formatting/brand.ts:8` `grey: "#76787b"` | 1 | Object key, read as `brandColors.grey` (2 call sites) |
| `lib/richtext/tokens.ts:37` `grey: "#808080"` | 1 | CSS colour-keyword lookup; `grey` is a real CSS keyword a browser emits |
| `"GREY"` stored block value | 4 | `prisma/seed.ts:77`, `lib/validation/blocks.ts:34`, `lib/types.ts:24`, `lib/formatting/rich-text.ts:7` — `ContentBlockVersion.textColor`. Latent today (stored values are LEA x20, BLACK x12) but it is the written contract |
| `lib/formatting/rich-text.ts:7` `tag: "grey"` | 1 | bbcode tag in stored job bodies, `[color=grey]`; `normalizeColor()` matches by key **or** tag |
| `prisma/seed.ts:965` `key: "color.grey"` | 1 | WorkspaceSetting key in the live database |
| `"CANCELLED"` uppercase | 21 occurrences | Stored `Interview.status` / `Booking.status`. Live: `Interview.status` holds `"CANCELLED"` x2 |
| `"cancelled"` lowercase | 8 occurrences | **Google Calendar API** event status: `lib/google/calendar.ts:60,230,534`, `interview-sync.ts:52,170`, `booking-sync.ts:52`, `lib/interviews/debrief.ts:147`. Changing these stops cancellation detection |
| `NewHire.canceled` column | schema + ~60 refs | Prisma column, American, indexed at `prisma/schema.prisma:428` |
| `prisma/schema.prisma:1834` `// CONFIRMED \| CANCELLED` | 1 | Documents a stored value; the comment must match the data |
| `"unrecognised-subject"` | 8 sites, 4 files | String-literal union. `components/people/PaycomScanButton.tsx:39` types it as `outcome: string`, so **tsc cannot catch a partial rename**. See the headline |
| `"recognise" \| "refuse"` in `scripts/paycom-notice-tests.ts` | 10 + the `RECOGNISED` set at :100 | Test-harness contract |
| `traveler_name` / `traveler_email` | 13 sites | Anthropic tool-schema property names (`required[]` at :124, `properties` at :129-130) and the parse path. Already American — do not let the British prose around them bleed in |
| "Jessica Storey" | 4 | A person's surname (`lib/fleet/staffing/maintenance-data.ts:78` and two PLAN.txt files), plus `scripts/_final.json` which also holds her real email |
| `Kevin Grey`, `grey.kevin@…`, `grey.37@…`, `seymour`, `nassour`, `mnassour` | 7 | Real names and email addresses in `scripts/_final.json` |
| `centre` in `lib/events/parse-event-email.ts:207` | 1 (after dedup) | Matches British venue names in inbound email |
| `tone="grey"` union | 3 | `components/interview-questions/InterviewQuestionsWorkspace.tsx:170,174,333` — internal prop union; rename all three together or not at all |
| `recolour` / `onRecolour` / `recategorise` / `normalise` / `neighbours` / `uncoloured` | ~25 | Identifiers: `CandidateTagEditor.tsx:95,122,240,249,291`, `ManageTagList.tsx:169,333`, `ManageReasonList.tsx:75,197`, `lib/travel/booking-groups.ts:43,51`, `lib/jobs/duplicate-detection.ts:359-373`, `scripts/candidate-types-tags-audit.ts:159,235`. All file-local, so renaming is possible — but as a deliberate per-file rename, never as a text substitution |
| `"TODO"` | many | Stored onboarding-task status (`TODO \| DONE \| NA`), not a code marker |
| `lib/roadmap/roadmap.ts` | 172 lines | Commit-and-push agent only. Its British spellings *are* user-visible on Command Center, so they are worth fixing — by that agent, not this pass |
| Prompt prose in `lib/extraction/travel-email-llm.ts:186,198,213,215` | 4 | Safe to respell, but it is **model input**, not UI copy. A later agent should know what it is editing |

---

## UNCERTAIN - needs a human in the morning

### 1. Raw `error.message` reaching the screen: structural, but I cannot say it has happened

27 API routes return `error.message` verbatim and 63 UI sites render it, and no catch
block distinguishes an app-authored validation error from a Prisma or runtime one
(`app/api/onboarding-milestones/route.ts`, pasted above, is the clearest).

Why I could not close it: proving that a Prisma message actually reaches a user means
making the database fail, which is a write against live production. I did not.

What would close it: one decision — tag app-authored errors (e.g. an `AppError` class
thrown by the `lib/` functions) and return `error instanceof AppError ? error.message
: "<friendly fallback>"`. The fallbacks are already written and already good; the only
change is which branch is trusted. A human should decide whether that is worth 27
edits now or is a follow-up item.

### 2. The empty-state three-way count

I measured 117 zero-length guards and 100 with visible copy, but could not reliably
split "offers a next action" from "bare message" — my classifier is demonstrably wrong
in at least one direction (`TrainingTab.tsx:360`). Every candidate I read had a real
empty state, so I am confident the app is in good shape here and unwilling to publish
the split as fact.

What would close it: a person reading the 64 I filed as "bare" and deciding which
genuinely want a next action. That is a judgement call per screen, not a grep.

### 3. Which way the 16 other Title Case nav labels should go

Body headings are 88% sentence case; the nav is 17 Title Case to 5 sentence case.
Several Title Case nav entries are plainly feature names that should keep their caps
("Command Center" and "Layout Lab" are locked; "Job Post Builder", "Question Bank",
"Crew Org Chart" read as names). Others look generic ("Content Blocks", "Final
Review", "Historical Archive", "Duplicate Review", "Pilot Requirements").

Why I could not close it: which of these is a product name is the user's call, and
naming decisions in this app are recorded as his. I fixed only the one unambiguous
outlier (CERTAIN #4).

What would close it: the user marking each of the 16 as "a name" or "a label". The
full list with line numbers is in the JOB 2 section above.

### 4. `label: "Grey"` versus the `brand-grey` token

Americanising the two visible "Grey" labels (8.17, 8.18) makes them differ from the
token they draw their colour from. I recommend doing it; the user may prefer
alignment. One sentence from him settles it.

### 5. Template literals that could render the word "undefined"

No hardcoded string contains "undefined", but there are 1,259 `${…}` interpolations in
`app` + `components`, and any with a nullable value and no fallback would render
"undefined" at runtime.

Why I could not close it: this needs type information per interpolation, not a grep,
and the project compiles with `strict: false` (recorded in `roadmap.ts`), so
`strictNullChecks` is not protecting them.

What would close it: enabling `strictNullChecks` in a throwaway tsconfig and reading
the nullable-in-template errors. That is real work, not a quick check, and it overlaps
`qa.md`'s territory.

### 6. One cross-reference I am deliberately not claiming

While reading empty states I noticed `components/fleet/orgchart/PeopleIndex.tsx:149`
sets `maxHeight: 340, overflowY: "auto"` inline, with no `overflowX` pinned, on a list
that grows with the roster. That touches both the fixed-cap rule and the
pin-the-other-axis rule in CLAUDE.md. **`visual.md` owns overflow and vertical space**
— I did not verify it rendered and I am not reporting it as a finding, only flagging
it in case their sweep of inline styles missed it.

---

## Counts

### JOB 1 - British spellings

| Measure | Number |
|---|---|
| Files in scope | 1,024 |
| Token families searched | 120 |
| Families returning zero (genuine, each with a non-zero control alongside) | 66 |
| **Total matching lines, all confirmed-British tokens** | **2,605** |
| ...in `lib/roadmap/roadmap.ts` (commit agent's; user-visible on Command Center) | 172 |
| ...outside `roadmap.ts` | 2,433 |
| **Hits flagged DO NOT CHANGE** | **~2,110** |
| — `brand-grey` Tailwind class alone | 1,890 |
| — other `grey` identifiers, stored values and names | 30 |
| — `"CANCELLED"` stored values | 21 |
| — `"cancelled"` Google Calendar API literals | 8 |
| — `"unrecognised-subject"` + the `recognise`/`refuse` test contract | 18 |
| — `traveler_name` / `traveler_email` schema keys | 13 |
| — surnames and email addresses (Storey, Grey, Seymour, Nassour) | 11 |
| — file-local identifiers (`recolour`, `recategorise`, `normalise`, `neighbours`, `tone="grey"`) | ~28 |
| — `roadmap.ts`, non-`grey` lines (not mine to edit) | 160 |
| **Hits SAFE TO CHANGE** | **~495** |
| — **user-visible, listed individually as CERTAIN #8** | **18** |
| — comments, JSDoc, developer docs, script console output | 313 |
| — `roadmap.ts` prose, for the commit agent | 164 |
| False positives checked and dropped (`cancellation`, `enrolled`, `advertise*`, `exercise*`, `supervise*`, `analysis`, `emphasis` noun, `totalling`) | 11 |

`grey` occurrence counts (`--count-matches`, not lines): 1,957 total — 1,890
`brand-grey`, 12 `"GREY"`, 12 `tone="grey"`, 3 `--skyshare-grey`, 2
`brandColors.grey`, the rest prose.

### JOB 2 - tone and labels

| Measure | Number |
|---|---|
| `<button>` elements with a literal text child | 50 (25 distinct strings) |
| Literal `h1`-`h3` headings classified | 209 |
| — sentence case | 160 (88% of the 182 classifiable) |
| — Title Case | 22 |
| — single word | 27 |
| Buttons in Title Case | 0 |
| Multi-word nav labels, Title Case | 17 |
| Multi-word nav labels, sentence case | 5 |
| UI strings using the `…` character | 150 |
| UI strings using `...` | 61 (across 62 lines) |
| Labels existing in BOTH spellings | 7 |
| List-rendering components | 56 |
| Zero-length empty guards | 117 |
| Lists confirmed to lack an empty state | **0** (3 candidates, all 3 fixed constant arrays) |
| UI sites rendering a raw `error.message` | 63 |
| API routes returning a raw `error.message` | 27 |
| User-visible strings containing "undefined" | 0 |
| Stack traces, Prisma codes or table names in UI copy | 0 |
| Lorem / placeholder filler | 0 (control: 5,187 lines match "candidate") |
| "Coming soon" copy on a shipped feature | 0 (1 hit, verified a legitimate empty state) |
| Shared date formatters in `lib/dates/display.ts` | 20 |
| Inline `toLocaleDateString` calls in the whole repo | 2 |
| Money formatters | 5 (3 identical, 1 compact-by-design, **1 genuine inconsistency**) |

### CERTAIN / UNCERTAIN

| | Count |
|---|---|
| CERTAIN items | 10 (covering 62 ellipsis lines, 18 user-visible spellings, 8 discrete fixes) |
| UNCERTAIN items | 6 |

---

*Probe `scripts/_r1-copy-probe.ts` was deleted after this file was written. No file in
the repo was created or modified by this agent except this one and its own claim file.*
