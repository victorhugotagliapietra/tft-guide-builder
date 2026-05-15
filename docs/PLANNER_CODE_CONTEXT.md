# TFT Planner Code Format

## Overview

A **planner code** is the string the TFT in-game Team Planner reads. We emit
real Riot codes — the kind that paste directly into the client — using the
compact v02 format also produced by MetaTFT and tactics.tools.

The code always ends with the literal suffix `TFTSet<N>` where `N` is the
current set number. For the current build that's `TFTSet17`.

---

## Wire format (v02)

```
02 + <10 × 3 hex chars> + TFTSet<N>
```

| Segment | Length | Meaning |
|---|---|---|
| `02` | 2 chars | Version prefix (constant for Set 9+) |
| Slots | 30 chars | 10 unit slots, 3 hex chars (12 bits) each. Each slot value = `(position << 7) \| championCode`. Empty slots are `000`. |
| `TFTSet<N>` | 8 chars (for Set 17) | Literal set suffix |

**Set 17 total length: 40 chars** (2 + 30 + 8).

### Slot encoding

Each 12-bit slot packs:
- **Position** — 5 high bits (0–27, `row * 7 + col`)
- **Champion code** — 7 low bits (1–127, the `team_planner_code` field from
  CDragon's `tftchampions-teamplanner.json` for the current set)

```
bit:  11 10 9 8 7 | 6 5 4 3 2 1 0
       position    | championCode
```

Code `0` is reserved as the empty-slot sentinel — champions with
`team_planner_code === 0` (e.g. the Set 17 enemy-Aatrox NPC) can't be encoded
and are skipped at export time.

### Board position layout

```
col:  0   1   2   3   4   5   6
row 0:  0   1   2   3   4   5   6   (back row — hexes furthest from enemy)
row 1:  7   8   9  10  11  12  13
row 2: 14  15  16  17  18  19  20
row 3: 21  22  23  24  25  26  27   (front row)
```

Position = `row * 7 + col`. Valid range: 0–27 (fits in 5 bits with room for
positions 28–31 if a future set ever expands the grid).

---

## Worked example

A known-good MetaTFT export (saved as a regression fixture in the codec):

```
0203102d01e02204f024025045000000TFTSet17
```

Decomposing the 10 slots:

| Slot | Hex | Decimal | Position | Code | Champion |
|---|---|---|---|---|---|
| 0 | `031` | 49 | 0 | 49 | Gragas |
| 1 | `02d` | 45 | 0 | 45 | Pyke |
| 2 | `01e` | 30 | 0 | 30 | Maokai |
| 3 | `022` | 34 | 0 | 34 | Karma |
| 4 | `04f` | 79 | 0 | 79 | Tahm Kench |
| 5 | `024` | 36 | 0 | 36 | Urgot |
| 6 | `025` | 37 | 0 | 37 | Pantheon |
| 7 | `045` | 69 | 0 | 69 | Cho'Gath |
| 8 | `000` | — | — | — | empty |
| 9 | `000` | — | — | — | empty |

All positions are 0 in this example because MetaTFT exports as a "team list"
without placement info. The TFT client interprets such codes as an unplaced
roster.

Our encoder preserves real positions when units are placed on specific hexes:

```
Board: Jinx (code 18) @ position 3, Maokai (30) @ 10, Pyke (45) @ 24
Code:  0219251ec2d000000000000000000000TFTSet17
```

Slot 0 = `192` = (3 << 7) | 18 = 402; slot 1 = `51e` = (10 << 7) | 30; etc.
A receiving client that understands position bits will place the champions on
those exact hexes; one that ignores them (like the original team-list reader)
still imports the three champions correctly.

---

## What is preserved / lost

The in-game format encodes ONLY (champion, position) pairs. It does NOT
preserve:

- Star levels
- Equipped items
- Augments
- Notes / metadata

That's a limitation of the wire format, not our implementation. All four
fields stay intact in the guide's JSONB `board_steps` record — the planner
code is just one export view.

---

## Exclusion rules at export

Some units on a board can't be encoded as a planner code. The encoder filters
them out and skips with a quiet debug log; if at least one valid unit remains
the export succeeds, otherwise it returns a user-visible error.

Naturally excluded (no entry in CDragon's `tftchampions-teamplanner.json`):

- Training Dummy (`TFT_TrainingDummy`)
- Mini Black Hole
- Rift Scuttler
- Golden Ox
- Blue Sentinel / Golem
- Any other dummy / summon / utility object Riot doesn't expose to the
  in-game planner

Explicitly dropped at encode time:

- `team_planner_code === 0` — collides with the empty-slot sentinel
  (Apex Primordian / `TFT17_Enemy_Aatrox`)
- `team_planner_code > 127` — doesn't fit the 7-bit slot. Set 17's max is
  104; included as a future-set guard.
- Positions outside 0–27 (defensive — `BoardUnit.position` is already
  schema-validated)
- Units beyond the planner's 10-slot maximum

---

## Implementation

### Files

| File | Role |
|---|---|
| `src/features/tft-data/planner-code.ts` | Encoder + decoder; module-load self-tests |
| `src/features/tft-data/use-tft-data.ts` | Fetches the team-planner manifest at app load; exposes `plannerCodeMap` |
| `src/features/tft-data/normalize.ts` | Accepts `teamPlannerCodes` in `NormalizeOptions`; attaches `plannerId` to each `TFTChampion` |

### Encoding pipeline (`generatePlannerCode`)

1. **Validate inputs** — non-empty board, valid set number, non-empty planner map.
2. **Phase 1: filter** — drop units whose championKey isn't in `plannerCodeMap`,
   whose code is 0 / > 127, whose position is out of range. Skipped units are
   logged with their reason.
3. **Phase 2: sort** — stable sort by board position so the same board always
   produces the same code. Cap at 10 (overflow warns + drops).
4. **Phase 3: pack** — for each unit, compute `(position << 7) | code`, format
   as 3-hex-char lowercase, padded with leading zeros. Pad slot list to 10
   with `000`.
5. **Phase 4: assemble** — concatenate `"02" + 30 hex chars + "TFTSet<N>"`.
6. **Self-validate** — match against the canonical `/^02([0-9a-fA-F]{30})TFTSet(\d+)$/`
   regex before returning. Codes that fail self-validation surface as an
   internal-error result (never silently emitted).

### Decoding pipeline (`decodePlannerCode`)

1. Strip whitespace, regex-match the canonical format.
2. Build a reverse map (code → apiName) from the input `plannerCodeMap`.
3. Walk the 10 slots; for each non-zero slot, unpack `(value >> 7)` and
   `(value & 0x7F)` for position and code. Look up the apiName.
4. Return `{ set, units: [{ championKey, position }] }`.

### Self-test

Two fixtures run at module load when `process.env.NODE_ENV !== "production"`
(Vite strips the entire block from production bundles via dead-code
elimination):

- **Fixture A** — decode the known-good MetaTFT example
  `0203102d01e02204f024025045000000TFTSet17` and assert 8 expected champions
  surface. Catches any regression in the decoder.
- **Fixture B** — encode a 3-unit positioned board (Jinx@3, Maokai@10,
  Pyke@24), then decode and assert positions + champions match. Catches
  encoder bugs.

Console logs:
- `[planner-code self-test A] decoded MetaTFT example: set=17, 8 units (…)`
- `[planner-code self-test B] roundtrip OK: 0219251ec2d…TFTSet17`
- Either `MISMATCH` or `failed` lines if a regression slips in.

---

## Manual verification (production)

1. Build a board in the app.
2. Click "Copy board code".
3. Console should show `[planner-code] generated 02…TFTSet17 (encoded=N)`.
4. Paste into the TFT client's Team Planner UI (Customize tab → Import).
5. Confirm: champions appear; the set selector reads "Set 17".

If a code fails to import:

- Check console for `[planner-code]` warnings — most failures bottom out in
  a champion missing its `team_planner_code` (helper unit slipped through)
  or a champion whose code is reserved (0) / out of range (> 127).
- Verify the suffix is exactly `TFTSet17`, not `TFTSet14`. An old suffix
  indicates a stale build or a bug in the set-number plumbing.
- Verify the code is exactly 40 chars for Set 17.

---

## Future considerations

If a future set introduces champion codes > 127, the 7-bit slot field is too
narrow. Symptoms: encoder skips champions with "code N out of range"
warnings; valid boards produce shorter codes than expected. The fix at that
point is to bump the version prefix to `03` and use 4 hex chars (16 bits)
per slot — 11 bits for code (up to 2047) and 5 bits for position. Until
then, the v02 format matches what the TFT client and major third-party
planners accept.

When bumping `CURRENT_SET` in `normalize.ts`, also bump the same constant
in `use-tft-data.ts` (next to the team-planner fetch). Both feed the
`TFTSet<N>` suffix.
