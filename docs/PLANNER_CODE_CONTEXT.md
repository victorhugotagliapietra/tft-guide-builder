# TFT Planner Code Format

## Overview

A **planner code** is the string the TFT in-game Team Planner reads. This
codec was reverse-engineered against a known-good Riot export sample
provided by the user and verified end-to-end: re-encoding the sample's
board state produces the exact byte sequence.

Codes end with `TFTSet<N>` where `N` is the current set. For Set 17:
`TFTSet17`.

---

## Wire format

```
02 + <10 × 3 hex chars> + TFTSet<N>
```

| Segment | Length | Meaning |
|---|---|---|
| `02` | 2 chars | Version prefix (Set 9+ format). |
| Slots | 30 chars | 10 unit slots, 3 hex chars (12 bits) each. Each value is the champion's `team_planner_code` from CDragon's `tftchampions-teamplanner.json` for the current set. Empty slots are `000`. |
| `TFTSet<N>` | 8 chars (for Set 17) | Literal set suffix. |

**Set 17 total length: 40 chars** (2 + 30 + 8).

### Slot contents

Each slot is the champion's `team_planner_code` written as **lowercase,
zero-padded 3-character hex**. Set 17 codes range 1–104 (max `0x68`), all
comfortably fit in 12 bits. The 12-bit width gives headroom for future
sets where codes might exceed 255.

Slot value `0x000` is reserved as the **empty-slot sentinel** — champions
with `team_planner_code === 0` (e.g. Set 17 Apex Primordian /
`TFT17_Enemy_Aatrox`) can't be encoded and are filtered out by the
encoder.

### Slot ORDERING

Verified against the Riot sample:

1. **Cost ascending** (1-cost champions first, 5-cost last)
2. **`character_id` alphabetic ascending** within each cost

Position on the board is **NOT encoded**. The TFT client treats the
planner code as a team roster; the player places champions on the board
themselves on import.

### Deduplication

A champion may appear multiple times on a board (e.g. three copies of
Lulu en-route to a 3-star). The TFT planner UI displays each champion
once regardless of count, so the encoder deduplicates by `character_id`
before sorting. First occurrence wins.

---

## Worked example

Verified known-good Riot export (sample provided by user):

```
0201d01b00d02c010043030000000000TFTSet17
```

Board: Aatrox, Caitlyn, Akali, Jax, Aurora, Diana, Lulu.

| Sort order | Champion | Cost | `team_planner_code` | Hex (3-char) |
|---|---|---|---|---|
| 1 | TFT17_Aatrox | 1 | 29 (0x1D) | `01d` |
| 2 | TFT17_Caitlyn | 1 | 27 (0x1B) | `01b` |
| 3 | TFT17_Akali | 2 | 13 (0x0D) | `00d` |
| 4 | TFT17_Jax | 2 | 44 (0x2C) | `02c` |
| 5 | TFT17_Aurora | 3 | 16 (0x10) | `010` |
| 6 | TFT17_Diana | 3 | 67 (0x43) | `043` |
| 7 | TFT17_Lulu | 3 | 48 (0x30) | `030` |
| 8–10 | _empty_ | — | — | `000` |

Slots concatenated: `01d01b00d02c010043030000000000`
Final: `02` + slots + `TFTSet17` = `0201d01b00d02c010043030000000000TFTSet17`

This was PowerShell-verified before committing: the encoder produces
byte-for-byte identical output given the sample's board state.

---

## What is preserved / lost

The wire format encodes ONLY champion identities. It does NOT preserve:

- Board positions
- Star levels
- Equipped items
- Augments
- Notes / metadata

That's a property of the wire format, not a limitation of the codec. All
of that state stays intact in the guide's JSONB `board_steps` record —
the planner code is one narrow export view.

---

## Exclusion rules

The encoder drops every unit that can't be encoded as a valid planner
slot. Natural exclusions (units not in CDragon's team-planner manifest):

- Training Dummy (`TFT_TrainingDummy`)
- Mini Black Hole
- Rift Scuttler
- Golden Ox
- Blue Sentinel / Golem
- Any other dummy / summon / NPC unit Riot doesn't expose to the
  in-game planner

Explicit drops at encode time:

- `team_planner_code === 0` — sentinel collision (Apex Primordian)
- `team_planner_code > 4095` — out of 12-bit range (future-set guard)
- Bad positions (defensive)
- Duplicate champions after the first occurrence
- Units beyond the 10-slot planner maximum after dedup + sort

Every drop is `console.debug`-logged with the apiName and the reason. If
at least one valid unit survives, the export succeeds; if every unit
gets filtered, the encoder returns a user-visible "No exportable
champions" error.

---

## Implementation

### Files

| File | Role |
|---|---|
| `src/features/tft-data/planner-code.ts` | Encoder + decoder + module-load self-test |
| `src/features/tft-data/use-tft-data.ts` | Fetches the team-planner manifest at app load; exposes `plannerCodeMap: Map<apiName, team_planner_code>` |
| `src/features/tft-data/normalize.ts` | Attaches `team_planner_code` to each `TFTChampion.plannerId` via `NormalizeOptions.teamPlannerCodes` |

### Encoding pipeline (`generatePlannerCode`)

Signature:

```ts
generatePlannerCode(
  units: BoardUnit[],
  setNumber: number,
  plannerCodeMap: Map<string, number>,      // apiName → team_planner_code
  championLookup: (apiName) => { cost: number } | undefined
): { ok: true; code: string } | { ok: false; error: string }
```

Pipeline:

1. **Validate** inputs (non-empty board, valid set, non-empty map).
2. **Filter to exportable**: drop units whose championKey isn't in
   `plannerCodeMap`, whose code is 0 or > 4095, whose championLookup
   returns nothing, or whose position is invalid.
3. **Deduplicate by apiName** (first occurrence wins).
4. **Sort by (cost ASC, apiName ASC)** — matches the Riot sample order.
5. **Cap at 10** (planner's max team size); overflow warned.
6. **Pack**: each champion's code becomes 3-char lowercase zero-padded
   hex. Pad slot list to 10 with `000`.
7. **Assemble**: `"02" + 30 hex + "TFTSet<N>"`.
8. **Self-validate** against `/^02([0-9a-fA-F]{30})TFTSet(\d+)$/` before
   returning.

### Decoding pipeline (`decodePlannerCode`)

1. Strip whitespace, regex-match the canonical format.
2. Build a reverse map (code → apiName) from `plannerCodeMap`.
3. Walk 10 slots; non-zero values resolve to a championKey via the
   reverse map. Unknown codes log a warning and are skipped.
4. Return `{ set, units: [{ championKey, slot }] }`.

### Debug logging at runtime

Every emit logs a single line containing:
- The full output string
- Encoded / skipped counters
- The raw 30-char payload (slot bytes)
- Per-champion breakdown: `apiName(cost=N, code=M=0xH)`
- Reason for each skipped unit

Example console output:

```
[planner-code] generated 0201d01b00d02c010043030000000000TFTSet17
  (encoded=7, skipped=0, payload="01d01b00d02c010043030000000000")
  | TFT17_Aatrox(cost=1, code=29=0x1d)
  | TFT17_Caitlyn(cost=1, code=27=0x1b)
  | TFT17_Akali(cost=2, code=13=0xd)
  | TFT17_Jax(cost=2, code=44=0x2c)
  | TFT17_Aurora(cost=3, code=16=0x10)
  | TFT17_Diana(cost=3, code=67=0x43)
  | TFT17_Lulu(cost=3, code=48=0x30)
```

A paste-into-client failure can be diagnosed from this line alone.

### Self-test (development-only)

Two fixtures run at module load when `process.env.NODE_ENV !==
"production"` (Vite strips the block from production bundles):

- **Fixture A** — decode the verified Riot sample
  `0201d01b00d02c010043030000000000TFTSet17` and assert 7 expected
  champions surface.
- **Fixture B** — encode the same board (using a stub map with the
  sample's 7 champions) and assert the output is **byte-for-byte equal**
  to the sample. Followed by a roundtrip decode.

Both fixtures log `OK` / `MISMATCH` so regressions in the wire format
surface immediately in the dev console.

---

## Manual / production verification

1. Build a board in the editor.
2. Click **Copy board code**.
3. Console logs `[planner-code] generated 02…TFTSet17 (encoded=N, …)`.
4. Paste into the TFT client's Team Planner UI (Customize → Import).
5. Confirm: champions appear in the planner; the set selector reads
   "Set 17".

If a code fails to import:

- Check the `[planner-code] generated …` log line for skipped champions
  (helper unit slipped through, or a champion's code is out of range).
- Verify the suffix is exactly `TFTSet17` and total length is 40.
- Verify `[TFT] Team-planner map: N entries for TFTSet17` at app boot
  shows ~63 entries.

---

## Future considerations

If a future TFT set introduces `team_planner_code` values > 4095, the
12-bit slot is too narrow. Symptoms: encoder skips champions with
"code N out of 12-bit range" warnings. The fix is to widen each slot —
likely a new `03` prefix with 4 hex chars / 16 bits per slot.

If Riot changes the sort key (e.g. by display_name instead of
character_id), Fixture B will mismatch immediately and the sort can be
adjusted in `planner-code.ts`. Until then, `(cost ASC, character_id
ASC)` matches the verified sample.

When bumping `CURRENT_SET`, update the constant in both `normalize.ts`
and `use-tft-data.ts` — both feed the `TFTSet<N>` suffix and the
team-planner manifest key.
