/**
 * TFT in-game team-planner code codec — compact v02 format.
 *
 * Emits codes that paste into MetaTFT / tactics.tools / the TFT client's
 * Team Planner UI.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WIRE FORMAT (verified against a known-working MetaTFT export)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   02 + <10 × 3 hex chars> + TFTSet<N>
 *
 *   - "02"          version prefix (constant for Set 9+).
 *   - 10 slots      one per max team-size unit at level 10. Each slot is
 *                   3 hex chars = 12 bits, encoded as:
 *
 *                       (position << 7) | championCode
 *
 *                     - position     : 5 bits, 0–27 (row * 7 + col)
 *                     - championCode : 7 bits, 1–127 (team_planner_code
 *                                      from CDragon's
 *                                      tftchampions-teamplanner.json)
 *
 *                   Empty slots are 0x000. Code 0 is reserved as the
 *                   empty-slot sentinel, so champions whose
 *                   team_planner_code is 0 (e.g. the Set 17 enemy-Aatrox
 *                   NPC) cannot be encoded — they're skipped at export.
 *
 *   - "TFTSet<N>"   literal set suffix; the client picks the right per-set
 *                   champion lookup table from this.
 *
 * Total length for Set 17: 2 + 30 + 8 = 40 chars.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * KNOWN-GOOD EXAMPLE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * MetaTFT-exported code:
 *   0203102d01e02204f024025045000000TFTSet17
 *
 * Decodes to 8 Set 17 champions (positions all 0 because MetaTFT exports
 * as a position-less team list — the TFT client places them on import):
 *
 *   Gragas (49) Pyke (45) Maokai (30) Karma (34)
 *   TahmKench (79) Urgot (36) Pantheon (37) Cho'Gath (69)
 *
 * Our encoder preserves actual positions in the top 5 bits when units
 * are placed on specific hexes — backward-compatible with the team-list
 * interpretation while richer for placed boards.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXCLUSION RULES
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The codec excludes any unit whose championKey is missing from the
 * supplied planner-code map. This naturally drops:
 *
 *   - Training Dummy (TFT_TrainingDummy) — synthetic helper, no
 *     team_planner_code in CDragon
 *   - Mini Black Hole, Rift Scuttler, Golden Ox, Golem — NPC units that
 *     never appear in the team-planner JSON
 *   - Any other dummy / summon / utility object Riot doesn't expose to
 *     the in-game planner
 *
 * Plus explicit drops at encode time:
 *
 *   - code === 0      collides with the empty-slot sentinel (Apex
 *                     Primordian / TFT17_Enemy_Aatrox)
 *   - code > 127      doesn't fit the 7-bit slot (no Set 17 champion
 *                     hits this; included as a future-set guard)
 *   - position < 0 || >= 28
 *
 * What's lost at export: star levels, equipped items, augments. Those
 * stay intact in the guide's JSONB record; the planner code is just one
 * export view.
 */

import type { BoardUnit } from "@/features/board-builder/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlannerResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/** apiName → team_planner_code (from CDragon team-planner JSON). */
export type PlannerCodeMap = Map<string, number>;

export type DecodedPlannerUnit = {
  championKey: string;
  position: number;
};

export type DecodedPlannerPayload = {
  set: number;
  units: DecodedPlannerUnit[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERSION_PREFIX = "02";
const SLOT_COUNT = 10;            // max team size at level 10
const SLOT_HEX_CHARS = 3;         // 12 bits per slot
const EMPTY_SLOT = "000";
const POSITION_BITS = 5;
const CHAMPION_BITS = 7;
const MAX_POSITION = (1 << POSITION_BITS) - 1;   // 31
const MAX_CHAMPION_CODE = (1 << CHAMPION_BITS) - 1; // 127
const HEX_PAYLOAD_LENGTH = SLOT_COUNT * SLOT_HEX_CHARS; // 30

// "02" + exactly 30 hex chars + "TFTSet<digits>" (whitespace-tolerant,
// case-insensitive hex via the caller's normalization).
const PLANNER_CODE_RE = /^02([0-9a-fA-F]{30})TFTSet(\d+)$/;

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Generate a TFT in-game team-planner code.
 *
 * Filters non-exportable units (Training Dummy, NPCs, etc.), sorts the
 * remainder by board position for stable output, and emits the compact
 * 40-char format above. Returns `{ ok: false, error }` for empty boards
 * or when no unit on the board has a known team_planner_code.
 */
export function generatePlannerCode(
  units: BoardUnit[],
  setNumber: number,
  plannerCodeMap: PlannerCodeMap
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
  // Any unit whose championKey isn't in plannerCodeMap is silently dropped
  // — that's the natural filter for Training Dummy / Mini Black Hole / Rift
  // Scuttler / Golden Ox / Golem and any other helper unit Riot doesn't
  // expose to the in-game planner. We additionally reject codes that
  // collide with the empty-slot sentinel (0) or don't fit the 7-bit slot.
  type Exportable = { position: number; championKey: string; code: number };
  const exportable: Exportable[] = [];
  const skipped: { championKey: string; reason: string }[] = [];

  for (const u of units) {
    if (!Number.isInteger(u.position) || u.position < 0 || u.position > 27) {
      skipped.push({ championKey: u.championKey, reason: `bad position ${u.position}` });
      continue;
    }
    const code = plannerCodeMap.get(u.championKey);
    if (typeof code !== "number") {
      // Not in the team-planner JSON — special / helper / NPC unit. Quiet.
      skipped.push({ championKey: u.championKey, reason: "no team_planner_code" });
      continue;
    }
    if (code === 0) {
      skipped.push({ championKey: u.championKey, reason: "code 0 reserved" });
      continue;
    }
    if (code < 0 || code > MAX_CHAMPION_CODE) {
      skipped.push({ championKey: u.championKey, reason: `code ${code} out of range` });
      continue;
    }
    if (u.position > MAX_POSITION) {
      // Defensive: BoardUnit positions are 0-27, well under 31, so this is
      // unreachable in practice — but the slot's position field is only 5
      // bits wide, so encode-time guarding prevents silent corruption.
      skipped.push({ championKey: u.championKey, reason: `position ${u.position} > 5-bit max` });
      continue;
    }
    exportable.push({ position: u.position, championKey: u.championKey, code });
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

  // ── Phase 2: deterministic ordering ─────────────────────────────────────
  // Sort by board position so the same board always produces the same code.
  exportable.sort((a, b) => a.position - b.position);

  // Cap at 10 — the in-game planner only has 10 slots. Anything beyond is
  // dropped (shouldn't happen on a legal board, but defensive).
  if (exportable.length > SLOT_COUNT) {
    const overflow = exportable.length - SLOT_COUNT;
    console.warn(
      `[planner-code] board has ${exportable.length} valid units; dropping ${overflow} ` +
      "beyond the planner's 10-slot maximum"
    );
  }
  const toExport = exportable.slice(0, SLOT_COUNT);

  // ── Phase 3: pack into 12-bit slots ─────────────────────────────────────
  const slots: string[] = toExport.map((u) => {
    const packed = (u.position << CHAMPION_BITS) | u.code;
    return packed.toString(16).padStart(SLOT_HEX_CHARS, "0").toLowerCase();
  });
  // Fixed-length output: pad to SLOT_COUNT with empty slots.
  while (slots.length < SLOT_COUNT) slots.push(EMPTY_SLOT);

  const code = `${VERSION_PREFIX}${slots.join("")}TFTSet${setNumber}`;

  // ── Phase 4: self-validate before returning ─────────────────────────────
  if (!PLANNER_CODE_RE.test(code)) {
    return {
      ok: false,
      error: "Internal error: generated code failed self-validation.",
    };
  }

  // Support-friendly debug log: code, unit count, what we skipped.
  if (skipped.length > 0) {
    console.debug(
      `[planner-code] generated ${code} ` +
      `(encoded=${toExport.length}, skipped=${skipped.length}: ` +
      skipped.map((s) => `${s.championKey}[${s.reason}]`).join(", ") +
      ")"
    );
  } else {
    console.debug(`[planner-code] generated ${code} (encoded=${toExport.length})`);
  }

  return { ok: true, code };
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Decode a compact-format planner code into champion positions.
 *
 * Tolerant of whitespace and mixed-case hex. Returns `{ ok: false }` for
 * any input that doesn't match the canonical 40-char Set 17 format.
 */
export function decodePlannerCode(
  code: string,
  plannerCodeMap: PlannerCodeMap
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

  // Build reverse map once per decode (small, ~60 entries — cheap).
  const reverse = new Map<number, string>();
  for (const [apiName, byteCode] of plannerCodeMap) {
    if (byteCode > 0 && byteCode <= MAX_CHAMPION_CODE) reverse.set(byteCode, apiName);
  }

  const units: DecodedPlannerUnit[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const slotHex = hex.substring(slot * SLOT_HEX_CHARS, (slot + 1) * SLOT_HEX_CHARS);
    const value = parseInt(slotHex, 16);
    if (value === 0) continue; // empty slot
    const position = (value >> CHAMPION_BITS) & MAX_POSITION;
    const championCode = value & MAX_CHAMPION_CODE;
    const championKey = reverse.get(championCode);
    if (!championKey) {
      console.warn(
        `[planner-code] unknown champion code ${championCode} in slot ${slot} (set ${set})`
      );
      continue;
    }
    units.push({ championKey, position });
  }

  return { ok: true, payload: { set, units } };
}

// ---------------------------------------------------------------------------
// Self-test (development-only)
// ---------------------------------------------------------------------------
//
// Two roundtrip fixtures run at module load in development:
//
//   1. The compact MetaTFT-exported example — verifies our decoder reads
//      the known-good wire format end-to-end.
//   2. A 3-unit positioned board — verifies the encoder produces a code
//      that roundtrips through our own decoder.
//
// Vite statically replaces `process.env.NODE_ENV`, so production builds
// strip this entire block via dead-code elimination.

if (
  typeof process !== "undefined" &&
  process.env?.NODE_ENV !== "production" &&
  typeof globalThis !== "undefined"
) {
  try {
    // Fixture A: the known-good MetaTFT example. All 10 slots use position 0
    // (team-list style export); we verify our decoder reads 8 known champions.
    const setSeventeenMap: PlannerCodeMap = new Map([
      ["TFT17_Gragas", 49],
      ["TFT17_Pyke", 45],
      ["TFT17_Maokai", 30],
      ["TFT17_Karma", 34],
      ["TFT17_TahmKench", 79],
      ["TFT17_Urgot", 36],
      ["TFT17_Pantheon", 37],
      ["TFT17_Chogath", 69],
    ]);
    const knownGood = "0203102d01e02204f024025045000000TFTSet17";
    const decA = decodePlannerCode(knownGood, setSeventeenMap);
    if (!decA.ok) {
      console.error("[planner-code self-test A] decode of known-good failed:", decA.error);
    } else if (decA.payload.set !== 17 || decA.payload.units.length !== 8) {
      console.error("[planner-code self-test A] decoded wrong shape:", decA.payload);
    } else {
      console.debug(
        `[planner-code self-test A] decoded MetaTFT example: set=${decA.payload.set}, ` +
        `${decA.payload.units.length} units (` +
        decA.payload.units.map((u) => u.championKey).join(", ") +
        ")"
      );
    }

    // Fixture B: positioned 3-unit board encode → decode roundtrip.
    const fixtureUnits: BoardUnit[] = [
      { id: "a", championKey: "TFT17_Jinx", position: 3, items: [], starLevel: 2, isCarry: false, isItemHolder: false },
      { id: "b", championKey: "TFT17_Maokai", position: 10, items: [], starLevel: 1, isCarry: false, isItemHolder: false },
      { id: "c", championKey: "TFT17_Pyke", position: 24, items: [], starLevel: 3, isCarry: false, isItemHolder: false },
    ];
    const fixtureMap: PlannerCodeMap = new Map([
      ["TFT17_Jinx", 18],
      ["TFT17_Maokai", 30],
      ["TFT17_Pyke", 45],
    ]);
    const encB = generatePlannerCode(fixtureUnits, 17, fixtureMap);
    if (!encB.ok) {
      console.error("[planner-code self-test B] encode failed:", encB.error);
    } else {
      const decB = decodePlannerCode(encB.code, fixtureMap);
      if (!decB.ok) {
        console.error("[planner-code self-test B] decode failed:", decB.error);
      } else {
        const okSet = decB.payload.set === 17;
        const okCount = decB.payload.units.length === 3;
        const okPositions = decB.payload.units
          .map((u) => `${u.championKey}@${u.position}`)
          .sort()
          .join(",") ===
          "TFT17_Jinx@3,TFT17_Maokai@10,TFT17_Pyke@24";
        const okSuffix = encB.code.endsWith("TFTSet17");
        const okLength = encB.code.length === 40;
        if (okSet && okCount && okPositions && okSuffix && okLength) {
          console.debug("[planner-code self-test B] roundtrip OK:", encB.code);
        } else {
          console.error(
            "[planner-code self-test B] roundtrip MISMATCH",
            { code: encB.code, decoded: decB.payload, okSet, okCount, okPositions, okSuffix, okLength }
          );
        }
      }
    }
  } catch (e) {
    console.error("[planner-code self-test] threw:", e);
  }
}
