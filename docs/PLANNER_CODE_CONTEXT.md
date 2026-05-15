# TFT Planner Code Format

## Overview

A **planner code** is the string the TFT in-game Team Planner reads. The
codec in `src/features/tft-data/planner-code.ts` emits the v01 format
documented in the community-reverse-engineered spec at
<https://gist.github.com/xrr2016/22fa6e92278a2481f9026f6456b0afa4>.

Codes always end with the literal suffix `TFTSet<N>` where `N` is the
current set. Set 17 codes therefore end with `TFTSet17`.

---

## Wire format (v01)

```
01 + <10 × 2 hex chars> + TFTSet<N>
```

| Segment | Length | Meaning |
|---|---|---|
| `01` | 2 chars | Version prefix (always `01` per the gist). |
| Slots | 20 chars | 10 unit slots, 1 byte each. Each byte is the champion's 1-indexed position in the alphabetically-sorted `character_id` list for the current set. Empty slots are `00`. |
| `TFTSet<N>` | 8 chars (for Set 17) | Literal set suffix. The TFT client uses it to pick the per-set champion lookup. |

**Total length, any set: 30 chars** (2 + 20 + 8).

### Champion ID encoding

> "Champion IDs are found by sorting the set by `character_id` alphabetically
> and then taking the 2 digit hexadecimal representation of champion's order
> in the list, with the first champion being 1 (01)."
> — [TFT Team Planner Codes (xrr2016)](https://gist.github.com/xrr2016/22fa6e92278a2481f9026f6456b0afa4)

For Set 17, alphabetically:

| Index | character_id |
|---|---|
| 1 (`01`) | TFT17_Aatrox |
| 2 (`02`) | TFT17_Akali |
| 3 (`03`) | TFT17_AurelionSol |
| … | … |
| 16 (`10`) | TFT17_Galio |
| … | … |

The mapping is built at runtime in `use-tft-data.ts` from CDragon's
`tftchampions-teamplanner.json` — sorting the `character_id` values for
`TFTSet<CURRENT_SET>` and 1-indexing them.

### Empty slots

> "Slots that are blank are represented by `00`. Blanks can be inserted in
> any champion slot but will be pushed to the end."

The encoder always emits 10 slots, padding with `00` to keep the output
length stable at 30 chars regardless of how many units the board has.

### What the format does NOT encode

- Star levels
- Equipped items
- Augments
- Board positions (the client places champions on import)

That's a property of the wire format, not our codec. Star / item / augment
state stays in the guide's JSONB `board_steps` record — the planner code
is one narrow export view.

---

## Worked example (from the gist)

```
010102030405060708090ATFTSet13
```

Decoded:

| Slot | Byte | Index | Set 13 champion (alphabetic) |
|---|---|---|---|
| 0 | `01` | 1 | Akali |
| 1 | `02` | 2 | Ambessa |
| 2 | `03` | 3 | Amumu |
| 3 | `04` | 4 | Annie |
| 4 | `05` | 5 | Camille |
| 5 | `06` | 6 | Cassiopeia |
| 6 | `07` | 7 | Corki |
| 7 | `08` | 8 | Darius |
| 8 | `09` | 9 | Dr. Mundo |
| 9 | `0A` | 10 | Ekko |

A code with Aatrox, Akali, and Galio on a Set 17 board (positions 3, 10, 24
respectively) becomes:

```
0101021000000000000000TFTSet17
```

(`01` for Aatrox, `02` for Akali, `10` = 16 for Galio, plus 7 empty `00`
slots.)

---

## Implementation

### Files

| File | Role |
|---|---|
| `src/features/tft-data/planner-code.ts` | Encode / decode + module-load self-test |
| `src/features/tft-data/use-tft-data.ts` | Fetches the team-planner manifest at app load; builds the alphabetic index; exposes `plannerCodeMap` |
| `src/features/tft-data/normalize.ts` | Attaches the alphabetic index to each `TFTChampion.plannerId` via `NormalizeOptions.teamPlannerCodes` |

### Encoding pipeline (`generatePlannerCode`)

1. Validate inputs (non-empty board, valid set number, non-empty map).
2. **Filter**: drop units whose `championKey` isn't in `plannerCodeMap` and
   whose index falls outside the 1–255 byte range. Skipped units are logged
   with their reason.
3. **Sort by board position** so the same board always produces the same
   code. Cap at 10 (the planner's max team size); overflow logged + dropped.
4. **Pack**: each unit's index becomes 2 hex chars (uppercase, zero-padded).
   Pad slot list to 10 with `00`.
5. **Assemble**: `"01" + 20 hex chars + "TFTSet<N>"`.
6. **Self-validate** against `/^01([0-9a-fA-F]{20})TFTSet(\d+)$/` before
   returning. Codes failing this check return an internal-error result.

### Decoding pipeline (`decodePlannerCode`)

1. Strip whitespace, match the canonical regex.
2. Build a reverse map (index → apiName) from the input `plannerCodeMap`.
3. Walk 10 byte slots; non-zero bytes resolve to a `championKey`. Unknown
   bytes log a warning and are skipped.
4. Return `{ set, units: [{ championKey, slot }] }`.

### Self-test (development-only)

`process.env.NODE_ENV !== "production"`-gated so Vite drops the block from
production. Two fixtures run at module load:

- **Fixture A** decodes the gist's worked Set 13 example and asserts 10
  units surface.
- **Fixture B** encodes a 3-unit Set 17 board (Aatrox/Akali/Galio at
  positions 3/10/24) and asserts the output exactly equals
  `0101021000000000000000TFTSet17` plus a successful roundtrip.

Console.error fires on any mismatch — regressions in the wire format
surface immediately instead of waiting for a paste-into-client failure.

---

## Exclusion rules at export

Units the encoder never emits:

- **Training Dummy** (`TFT_TrainingDummy`) — synthetic helper, not in the
  team-planner manifest.
- **Mini Black Hole, Rift Scuttler, Golden Ox, Blue Sentinel** — NPC units
  that don't appear in CDragon's team-planner JSON either.
- **Any unit whose `championKey` isn't a key in `plannerCodeMap`** — the
  manifest IS the source of truth for what's valid to encode.
- **Apex Primordian** (`TFT17_Enemy_Aatrox`) — appears in the manifest with
  alphabetic index 13 in Set 17, so technically encodable, but it's a
  boss-encounter unit users won't have on their board in practice.

Every drop is logged with its reason via `console.debug`. If at least one
unit remains the export succeeds; if every unit gets filtered, the encoder
returns a clear user-visible error.

---

## Manual / production verification

1. Build a board in the editor.
2. Click **Copy board code**.
3. Console logs `[planner-code] generated 01…TFTSet17 (encoded=N)`.
4. Paste into the TFT client's Team Planner UI (Customize → Import).
5. Confirm: champions appear; the set selector reads "Set 17".

If a code fails to import:

- Check `[planner-code]` warnings for skipped units (helper unit slipped
  through, or a champion's index is out of range).
- Verify the suffix is exactly `TFTSet17` and the total length is 30.
- Verify the `[TFT] Team-planner alphabetic index: N entries for TFTSet17`
  line at app boot shows roughly 60–70 entries (Set 17 has ~63 playable
  champions plus a couple of NPCs).

---

## Future considerations

If a future set has > 255 champions, the 1-byte slot is too narrow — but
that's a hypothetical: TFT sets typically have 50–70 champions.

If Riot introduces a v02 format with extra fields (positions, stars, etc.),
the canonical regex needs to be relaxed and the decoder taught the new
layout. Until then v01 is the documented format the client accepts.

When bumping `CURRENT_SET` in `normalize.ts`, also bump the matching
constant in `use-tft-data.ts` — both feed the `TFTSet<N>` suffix and the
per-set lookup key.
