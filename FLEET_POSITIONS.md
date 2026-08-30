# Fleet positions — master list

This is the single, hand-maintained list of every pilot position SkyShare hires for.
It is the **source of truth** the app reads from (Jobs, Pilot Requirements, Matchboard),
so the same aircraft and seats show up consistently everywhere.

## How to edit
- **Add a position:** copy a row and change the values. Alignment doesn't matter.
- **Retire a position:** don't delete it — set **Status** to `Archived`. It stays on the
  list (so historical candidates/jobs still make sense) but won't appear as an active role.
- After editing, run `npm run fleet:sync` to update the app from this file.
- **Columns:**
  - **Aircraft** — the airframe / fleet (e.g. `Pilatus PC-12`). One spelling per aircraft.
  - **Type rating** — the shared FAA type rating that qualifies a pilot. `CE-525` covers
    M2/CJ/CJ2(+/CJ3); `CE-560XL` covers the 560XL family; `G-V` covers G450/G550/GV;
    `G-200` for the G200; `EMB-500/505/145` for the Phenoms/Legacy. Leave **blank** when no
    type rating is required (e.g. PC-12). Used by the matcher so a rating credits all
    aircraft sharing it.
  - **Role** — `Captain`, `First Officer`, or `Lead Captain`.
  - **Seat** — `PIC` (Captain / Lead Captain) or `SIC` (First Officer).
  - **Position title** — the internal title shown on screen (e.g. `PC-12 Captain`). Always
    model-specific internally; the public/advertised name (e.g. "CE525") is handled separately
    on the outgoing job post, not here.
  - **Status** — `Active` or `Archived`.
  - **Notes** — anything worth recording.

## Positions

_Ordered by aircraft size._

| Aircraft | Type rating | Role | Seat | Position title | Status | Notes |
|---|---|---|---|---|---|---|
| Pilatus PC-12 NGX | | Captain | PIC | PC-12 NGX Captain | Archived | no type rating required |
| Pilatus PC-12 NG | | Captain | PIC | PC-12 NG Captain | Archived | no type rating required |
| Pilatus PC-12 | | Captain | PIC | PC-12 Captain | Active | no type rating required |
| Pilatus PC-12 | | First Officer | SIC | PC-12 First Officer | Active | no type rating required |
| Phenom 100 | EMB-500 | Captain | PIC | Phenom 100 Captain | Active | |
| Phenom 100 | EMB-500 | First Officer | SIC | Phenom 100 First Officer | Active | |
| Phenom 300 | EMB-505 | Captain | PIC | Phenom 300 Captain | Archived | |
| Phenom 300 | EMB-505 | First Officer | SIC | Phenom 300 First Officer | Archived | |
| Citation M2 | CE-525 | Captain | PIC | M2 Captain | Active | also advertised as CE-525 / CE525 |
| Citation M2 | CE-525 | First Officer | SIC | M2 First Officer | Active | also advertised as CE-525 / CE525 |
| Citation CJ | CE-525 | Captain | PIC | CJ Captain | Active | also advertised as CE-525 / CE525 |
| Citation CJ2 | CE-525 | Captain | PIC | CJ2 Captain | Active | also advertised as CE-525 / CE525 |
| Citation CJ2 | CE-525 | First Officer | SIC | CJ2 First Officer | Active | also advertised as CE-525 / CE525 |
| Citation 560XL | CE-560XL | Captain | PIC | 560XL Captain | Active | |
| Citation 560XL | CE-560XL | First Officer | SIC | 560XL First Officer | Active | |
| Citation 560XLS+ | CE-560XL | Captain | PIC | 560XLS+ Captain | Archived | |
| Citation 560XLS+ | CE-560XL | First Officer | SIC | 560XLS+ First Officer | Archived | |
| Challenger 350 | CL-30 | Captain | PIC | Challenger 350 Captain | Active | managed, tail N522AD, SLC based; CL-30 rating confirmed by the user Aug 28, shared with the Challenger 300 which SkyShare does not operate |
| Challenger 350 | CL-30 | First Officer | SIC | Challenger 350 First Officer | Active | managed, tail N522AD, SLC based |
| Praetor 600 | EMB-550 | Captain | PIC | Praetor 600 Captain | Active | managed, Ogden based; tail unknown until the aircraft is purchased |
| Praetor 600 | EMB-550 | First Officer | SIC | Praetor 600 First Officer | Active | managed, Ogden based; tail unknown until the aircraft is purchased |
| Gulfstream G200 | G-200 | Captain | PIC | G200 Captain | Active | |
| Gulfstream G200 | G-200 | First Officer | SIC | G200 First Officer | Active | |
| Gulfstream G450 | G-V | Lead Captain | PIC | G450 Lead Captain | Archived | |
| Gulfstream G450 | G-V | Captain | PIC | G450 Captain | Archived | |
| Gulfstream G450 | G-V | First Officer | SIC | G450 First Officer | Archived | |
| Gulfstream G450 & GV | G-V | Captain | PIC | G450 & GV Captain | Active | |
| Gulfstream G450 & GV | G-V | First Officer | SIC | G450 & GV First Officer | Active | |
| Legacy 650 | EMB-145 | Lead Captain | PIC | Legacy 650 Lead Captain | Archived | |
| Legacy 650 | EMB-145 | Captain | PIC | Legacy 650 Captain | Archived | |
| Legacy 650 | EMB-145 | First Officer | SIC | Legacy 650 First Officer | Archived | |

<!-- Add new positions below this line -->
