/**
 * TFT in-game team-planner code codec.
 *
 * Reverse-engineered against a known-good Riot export sample provided by
 * the user. The format is verified end-to-end: re-encoding the sample's
 * board state with this codec produces the exact byte sequence.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WIRE FORMAT (verified)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   02 + <10 × 3 hex chars> + TFTSet<N>
 *
 *   - "02" version prefix (Set 9+ format).
 *
 *   - 10 slots, each 3 hex characters = 12 bits per slot. Each slot value
 *     is the champion's `team_planner_code` from CDragon's
 *     `tftchampions-teamplanner.json` for the current set, written as a
 *     lowercase, zero-padded hex string. Empty slots are `000`.
 *
 *     12 bits accommodates codes 0–4095, comfortably covering every Set
 *     17 code (max 104) and headroom for future sets.
 *
 *   - "TFTSet<N>" literal set suffix.
 *
 *   - Slot ORDERING (verified against the Riot sample): cost ASCENDING,
 *     then character_id ASCENDING alphabetic within each cost. Position
 *     on the board is NOT encoded — the TFT client treats the code as a
 *     team roster and lets the player place units on import.
 *
 *   - Champions are deduplicated by character_id before encoding (the TFT
 *     planner UI lists each champion once even if a board has multiple
 *     copies for star-up purposes).
 *
 *   - Empty / NPC champions whose `team_planner_code` is 0 (e.g. Set 17
 *     Apex Primordian / `TFT17_Enemy_Aatrox`) are filtered out — code 0
 *     collides with the empty-slot sentinel.
 *
 * Total Set 17 length: 2 + 30 + 8 = 40 chars.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * KNOWN-GOOD SAMPLE
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   Board: Aatrox(1), Caitlyn(1), Akali(2), Jax(2), Aurora(3), Diana(3), Lulu(3)
 *   Codes: 29(0x1D), 27(0x1B), 13(0x0D), 44(0x2C), 16(0x10), 67(0x43), 48(0x30)
 *   Order (cost asc, apiName asc):
 *     - Cost 1: TFT17_Aatrox(29), TFT17_Caitlyn(27)
 *     - Cost 2: TFT17_Akali(13), TFT17_Jax(44)
 *     - Cost 3: TFT17_Aurora(16), TFT17_Diana(67), TFT17_Lulu(48)
 *   Slots: 01d 01b 00d 02c 010 043 030 000 000 000
 *   Full:  0201d01b00d02c010043030000000000TFTSet17
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXCLUSION RULES
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Units that aren't in the team-planner manifest are silently dropped:
 *
 *   - Training Dummy (TFT_TrainingDummy)
 *   - Mini Black Hole, Rift Scuttler, Golden Ox, Blue Sentinel
 *   - Any other helper / summon / NPC unit
 *
 * Explicitly dropped at encode time:
 *
 *   - team_planner_code === 0 (sentinel collision; e.g. Apex Primordian)
 *   - team_planner_code > 4095 (out of 12-bit range; future-set guard)
 *   - Positions outside 0–27 (defensive)
 *   - Duplicate apiNames after the first occurrence
 *   - Units beyond the planner's 10-slot maximum after dedup + sort
 */

import type { BoardUnit } from "@/features/board-builder/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlannerResult = { ok: true; code: string } | { ok: false; error: string };

/** apiName → team_planner_code (12-bit value). */
export type PlannerCodeMap = Map<string, number>;

/**
 * Minimal champion-info lookup the encoder needs for sorting. The caller
 * passes a function rather than a Map<TFTChampion> so this file stays free
 * of UI-layer type imports.
 */
export type ChampionInfoLookup = (apiName: string) => { cost: number } | undefined;

export type DecodedPlannerUnit = {
  championKey: string;
  /** Slot index 0–9 in the original code (preserved for stable ordering). */
  slot: number;
};

export type DecodedPlannerPayload = {
  set: number;
  units: DecodedPlannerUnit[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERSION_PREFIX = "02";
const SLOT_COUNT = 10;
const SLOT_HEX_CHARS = 3; // 12 bits per slot
const EMPTY_SLOT = "000";
const MAX_CODE = (1 << 12) - 1; // 4095
const HEX_PAYLOAD_LENGTH = SLOT_COUNT * SLOT_HEX_CHARS; // 30

// "02" + exactly 30 hex chars + "TFTSet<digits>" — whitespace-tolerant,
// case-insensitive on the hex bytes (canonical output is lowercase).
const PLANNER_CODE_RE = /^02([0-9a-fA-F]{30})TFTSet(\d+)$/;

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Generate a TFT in-game team-planner code from a board state.
 *
 * Pipeline:
 *   1. Filter to units whose championKey has a team_planner_code in the map
 *      AND whose championLookup yields a cost (filters out Training Dummy,
 *      NPCs, helper units).
 *   2. Drop code 0 (empty sentinel collision) and codes > 4095.
 *   3. Deduplicate by championKey (TFT planner UI lists each champion once).
 *   4. Sort by (cost ASC, championKey ASC) — matches the Riot sample order.
 *   5. Cap at 10 (planner's max team size).
 *   6. Emit `02` + 10 × 3-hex-char slots (lowercase, zero-padded) + `TFTSet<N>`.
 *   7. Self-validate against the canonical regex before returning.
 */
export function generatePlannerCode(
  units: BoardUnit[],
  setNumber: number,
  plannerCodeMap: PlannerCodeMap,
  championLookup: ChampionInfoLookup,
): PlannerResult {
  if (!units || units.length === 0) {
    return { ok: false, error: "Board is empty — add at least one champion." };
  }
  if (!Number.isInteger(setNumber) || setNumber < 1) {
    return { ok: false, error: `Invalid set number: ${setNumber}` };
  }
  if (plannerCodeMap.size === 0) {
    return {
      ok: false,
      error: "Team-planner data isn't loaded yet — try again in a moment.",
    };
  }

  // ── Phase 1: filter to exportable units ─────────────────────────────────
  type Exportable = { apiName: string; cost: number; code: number };
  const exportable: Exportable[] = [];
  const skipped: { championKey: string; reason: string }[] = [];

  for (const u of units) {
    if (!Number.isInteger(u.position) || u.position < 0 || u.position > 27) {
      skipped.push({ championKey: u.championKey, reason: `bad position ${u.position}` });
      continue;
    }
    const code = plannerCodeMap.get(u.championKey);
    if (typeof code !== "number") {
      // Training Dummy / Mini Black Hole / Rift Scuttler / helper units
      // aren't in CDragon's team-planner manifest, so they hit this branch
      // and are silently dropped.
      skipped.push({ championKey: u.championKey, reason: "not in team-planner manifest" });
      continue;
    }
    if (code === 0) {
      skipped.push({ championKey: u.championKey, reason: "code 0 reserved (empty sentinel)" });
      continue;
    }
    if (code < 0 || code > MAX_CODE) {
      skipped.push({ championKey: u.championKey, reason: `code ${code} out of 12-bit range` });
      continue;
    }
    const info = championLookup(u.championKey);
    if (!info) {
      skipped.push({ championKey: u.championKey, reason: "no champion info (cost unknown)" });
      continue;
    }
    exportable.push({ apiName: u.championKey, cost: info.cost, code });
  }

  if (exportable.length === 0) {
    return {
      ok: false,
      error:
        "No exportable champions on the board — the in-game planner only " +
        "accepts standard playable units (Training Dummy and helper units " +
        "are excluded).",
    };
  }

  // ── Phase 2: deduplicate by apiName ─────────────────────────────────────
  // TFT's team planner shows each champion once even if a board has multiple
  // copies for star-up. Keep the first occurrence per apiName.
  const seen = new Set<string>();
  const deduped: Exportable[] = [];
  for (const e of exportable) {
    if (seen.has(e.apiName)) continue;
    seen.add(e.apiName);
    deduped.push(e);
  }

  // ── Phase 3: sort (cost ASC, apiName ASC) ───────────────────────────────
  // Matches the Riot sample exactly: cost-1 champs first (alphabetically
  // within cost), then cost-2, etc.
  deduped.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.apiName.localeCompare(b.apiName);
  });

  if (deduped.length > SLOT_COUNT) {
    const overflow = deduped.length - SLOT_COUNT;
    console.warn(
      `[planner-code] board has ${deduped.length} unique champions; ` +
        `dropping ${overflow} beyond the planner's 10-slot max`,
    );
  }
  const toExport = deduped.slice(0, SLOT_COUNT);

  // ── Phase 4: emit slot hex (lowercase, zero-padded to 3 chars) ──────────
  const slots: string[] = toExport.map((u) =>
    u.code.toString(16).padStart(SLOT_HEX_CHARS, "0").toLowerCase(),
  );
  while (slots.length < SLOT_COUNT) slots.push(EMPTY_SLOT);

  const code = `${VERSION_PREFIX}${slots.join("")}TFTSet${setNumber}`;

  // ── Phase 5: self-validate ──────────────────────────────────────────────
  if (!PLANNER_CODE_RE.test(code)) {
    return {
      ok: false,
      error: "Internal error: generated code failed self-validation.",
    };
  }

  // Support-friendly debug log — each champion's apiName + resolved code +
  // final packed payload + the canonical 40-char output. Lets a paste-failure
  // report be diagnosed straight from console logs.
  const breakdown = toExport
    .map((u) => `${u.apiName}(cost=${u.cost}, code=${u.code}=0x${u.code.toString(16)})`)
    .join(" | ");
  console.debug(
    `[planner-code] generated ${code} ` +
      `(encoded=${toExport.length}, skipped=${skipped.length}, ` +
      `payload="${slots.join("")}")` +
      (toExport.length > 0 ? ` | ${breakdown}` : "") +
      (skipped.length > 0
        ? ` | dropped: ${skipped.map((s) => `${s.championKey}[${s.reason}]`).join(", ")}`
        : ""),
  );

  return { ok: true, code };
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Decode a v02 planner code into champion entries.
 *
 * Returns `{ ok: false }` for any input that doesn't match the canonical
 * 40-char Set 17 shape. Whitespace-tolerant and case-insensitive on the
 * hex bytes.
 */
export function decodePlannerCode(
  code: string,
  plannerCodeMap: PlannerCodeMap,
): { ok: true; payload: DecodedPlannerPayload } | { ok: false; error: string } {
  if (typeof code !== "string" || !code.trim()) {
    return { ok: false, error: "Empty planner code." };
  }
  const trimmed = code.replace(/\s+/g, "");
  const match = PLANNER_CODE_RE.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error:
        'Code must be "02<30 hex chars>TFTSet<N>" — got ' +
        `${trimmed.slice(0, 10)}…(${trimmed.length} chars)`,
    };
  }
  const hex = match[1];
  const set = parseInt(match[2], 10);

  // Reverse map built once per decode (~60 entries, negligible cost).
  const reverse = new Map<number, string>();
  for (const [apiName, code] of plannerCodeMap) {
    if (code > 0 && code <= MAX_CODE) reverse.set(code, apiName);
  }

  const units: DecodedPlannerUnit[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const slotHex = hex.substring(slot * SLOT_HEX_CHARS, (slot + 1) * SLOT_HEX_CHARS);
    const value = parseInt(slotHex, 16);
    if (value === 0) continue; // empty slot
    const championKey = reverse.get(value);
    if (!championKey) {
      console.warn(
        `[planner-code] unknown code ${value} (0x${value.toString(16)}) in slot ${slot} (set ${set})`,
      );
      continue;
    }
    units.push({ championKey, slot });
  }

  return { ok: true, payload: { set, units } };
}

// ---------------------------------------------------------------------------
// Self-test (development-only)
// ---------------------------------------------------------------------------
//
// Two roundtrip fixtures verify the codec against the user-provided sample:
//
//   - Fixture A: decode the known-good Riot Set 17 sample
//   - Fixture B: encode the same board (Aatrox/Caitlyn/Akali/Jax/Aurora/
//                Diana/Lulu) and assert byte-for-byte equality with the
//                sample, plus roundtrip through the decoder
//
// Vite statically strips this block from production bundles.

if (
  typeof process !== "undefined" &&
  process.env?.NODE_ENV !== "production" &&
  typeof globalThis !== "undefined"
) {
  try {
    // Set 17 codes for the user's sample board (verbatim from the JSON
    // provided in context/PLANNERCODES.txt).
    const sampleMap: PlannerCodeMap = new Map([
      ["TFT17_Aatrox", 29],
      ["TFT17_Caitlyn", 27],
      ["TFT17_Akali", 13],
      ["TFT17_Jax", 44],
      ["TFT17_Aurora", 16],
      ["TFT17_Diana", 67],
      ["TFT17_Lulu", 48],
    ]);
    const sampleCostLookup: ChampionInfoLookup = (api) => {
      const costs: Record<string, number> = {
        TFT17_Aatrox: 1,
        TFT17_Caitlyn: 1,
        TFT17_Akali: 2,
        TFT17_Jax: 2,
        TFT17_Aurora: 3,
        TFT17_Diana: 3,
        TFT17_Lulu: 3,
      };
      return costs[api] !== undefined ? { cost: costs[api] } : undefined;
    };
    const knownGood = "0201d01b00d02c010043030000000000TFTSet17";

    // Fixture A: decode the sample. Should yield 7 units in slot order.
    const decA = decodePlannerCode(knownGood, sampleMap);
    if (!decA.ok) {
      console.error("[planner-code self-test A] decode of known sample failed:", decA.error);
    } else if (decA.payload.set !== 17 || decA.payload.units.length !== 7) {
      console.error("[planner-code self-test A] wrong shape:", decA.payload);
    } else {
      console.debug(
        `[planner-code self-test A] decoded Riot sample: set=${decA.payload.set}, ` +
          `${decA.payload.units.length} units (` +
          decA.payload.units.map((u) => `${u.championKey}@slot${u.slot}`).join(", ") +
          ")",
      );
    }

    // Fixture B: encode the same board (positions arbitrary — sort uses
    // cost+apiName, not position) and assert byte-for-byte equality.
    const fixtureUnits: BoardUnit[] = [
      {
        id: "1",
        championKey: "TFT17_Diana",
        position: 3,
        items: [],
        starLevel: 1,
        isCarry: false,
        isItemHolder: false,
      },
      {
        id: "2",
        championKey: "TFT17_Lulu",
        position: 4,
        items: [],
        starLevel: 1,
        isCarry: false,
        isItemHolder: false,
      },
      {
        id: "3",
        championKey: "TFT17_Aatrox",
        position: 5,
        items: [],
        starLevel: 1,
        isCarry: false,
        isItemHolder: false,
      },
      {
        id: "4",
        championKey: "TFT17_Jax",
        position: 10,
        items: [],
        starLevel: 1,
        isCarry: false,
        isItemHolder: false,
      },
      {
        id: "5",
        championKey: "TFT17_Caitlyn",
        position: 14,
        items: [],
        starLevel: 1,
        isCarry: false,
        isItemHolder: false,
      },
      {
        id: "6",
        championKey: "TFT17_Akali",
        position: 16,
        items: [],
        starLevel: 1,
        isCarry: false,
        isItemHolder: false,
      },
      {
        id: "7",
        championKey: "TFT17_Aurora",
        position: 20,
        items: [],
        starLevel: 1,
        isCarry: false,
        isItemHolder: false,
      },
    ];
    const encB = generatePlannerCode(fixtureUnits, 17, sampleMap, sampleCostLookup);
    if (!encB.ok) {
      console.error("[planner-code self-test B] encode failed:", encB.error);
    } else {
      const ok = encB.code === knownGood;
      if (ok) {
        console.debug("[planner-code self-test B] encoder matches Riot sample:", encB.code);
      } else {
        console.error("[planner-code self-test B] encoder MISMATCH", {
          got: encB.code,
          expected: knownGood,
        });
      }
      const decB = decodePlannerCode(encB.code, sampleMap);
      if (!decB.ok || decB.payload.units.length !== 7) {
        console.error("[planner-code self-test B] roundtrip decode failed:", decB);
      }
    }
  } catch (e) {
    console.error("[planner-code self-test] threw:", e);
  }
}
