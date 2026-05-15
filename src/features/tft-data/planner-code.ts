/**
 * TFT in-game team-planner code codec (format v01).
 *
 * Emits codes that paste directly into the TFT client's Team Planner UI.
 * Format documented at:
 *   https://gist.github.com/xrr2016/22fa6e92278a2481f9026f6456b0afa4
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WIRE FORMAT (v01)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   01 + <10 × 2 hex chars> + TFTSet<N>
 *
 *   - "01"          version prefix.
 *   - 10 slots      one per max team-size unit at level 10. Each slot is
 *                   exactly 2 hex chars (1 byte) containing the champion's
 *                   ALPHABETIC INDEX in the current set (1-indexed). The
 *                   index is derived from `tftchampions-teamplanner.json`:
 *                   take every `character_id` for the current set, sort
 *                   ascending, and assign positions starting at 1.
 *   - 0x00          reserved as the empty-slot sentinel. Blank slots are
 *                   pushed to the end on import per the gist spec.
 *   - "TFTSet<N>"   literal set suffix.
 *
 * Total length for any set: 2 + 20 + 8 = 30 chars. The format is
 * deliberately compact — there are NO position bits, NO star bits, NO
 * item / augment bits. The in-game planner reads the code as a team
 * roster only; the player places champions on the board themselves.
 *
 * That's a fundamental property of the wire format, not a limitation of
 * this codec. Star level, equipped items, augments, and board positions
 * stay intact in our guide's JSONB record — the planner code is just one
 * narrow export view.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * KNOWN-GOOD EXAMPLES
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Gist worked example (Set 13):
 *   010102030405060708090ATFTSet13
 *   → Akali (1), Ambessa (2), Amumu (3), … Bel'Veth (10) — the first 10
 *     champions alphabetically in Set 13.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXCLUSION RULES
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Units that aren't in the team-planner manifest are silently dropped
 * with a debug log. That naturally excludes:
 *
 *   - Training Dummy (TFT_TrainingDummy) — synthetic helper unit
 *   - Mini Black Hole, Rift Scuttler, Golden Ox, Blue Sentinel — NPCs
 *   - Any other dummy / summon / utility object that doesn't appear in
 *     CDragon's tftchampions-teamplanner.json for the current set
 *
 * Plus explicit drops:
 *
 *   - Alphabetic index === 0 (sentinel collision)
 *   - Alphabetic index > 255 (won't fit a 1-byte slot — future-set guard;
 *     no current set has > 255 playable champions)
 *   - Units beyond the planner's 10-slot maximum (excess sorted out)
 */

import type { BoardUnit } from "@/features/board-builder/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlannerResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/** apiName → 1-indexed alphabetic position in the current set. */
export type PlannerCodeMap = Map<string, number>;

export type DecodedPlannerUnit = {
  championKey: string;
  /** Slot index 0–9 in the original code (preserved for stable order). */
  slot: number;
};

export type DecodedPlannerPayload = {
  set: number;
  units: DecodedPlannerUnit[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERSION_PREFIX = "01";
const SLOT_COUNT = 10;            // max team size at level 10
const SLOT_HEX_CHARS = 2;         // 1 byte per slot
const EMPTY_SLOT = "00";
const MAX_INDEX = 255;            // 8-bit slot limit
const HEX_PAYLOAD_LENGTH = SLOT_COUNT * SLOT_HEX_CHARS; // 20

// "01" + exactly 20 hex chars + "TFTSet<digits>" (whitespace-tolerant
// canonical form; the decoder strips whitespace and accepts mixed case).
const PLANNER_CODE_RE = /^01([0-9a-fA-F]{20})TFTSet(\d+)$/;

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Generate a TFT in-game team-planner code from a board state.
 *
 * Pipeline:
 *   1. Filter to units whose championKey has an alphabetic index in
 *      `plannerCodeMap` (drops Training Dummy / NPCs / helper units).
 *   2. Validate each index fits 1 byte (1–255).
 *   3. Sort by board position so the same board always produces the same
 *      code (the planner format itself doesn't encode position, but stable
 *      ordering keeps the output reproducible for diffing / caching).
 *   4. Take the first 10 (planner's max).
 *   5. Emit `01` + 10 × 2-hex-char slots + `TFTSet<N>`.
 *   6. Self-validate against the canonical regex.
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
  type Exportable = { position: number; championKey: string; index: number };
  const exportable: Exportable[] = [];
  const skipped: { championKey: string; reason: string }[] = [];

  for (const u of units) {
    if (!Number.isInteger(u.position) || u.position < 0 || u.position > 27) {
      skipped.push({ championKey: u.championKey, reason: `bad position ${u.position}` });
      continue;
    }
    const index = plannerCodeMap.get(u.championKey);
    if (typeof index !== "number") {
      // Not in the team-planner manifest — Training Dummy / NPC / helper.
      skipped.push({ championKey: u.championKey, reason: "not in team-planner manifest" });
      continue;
    }
    if (index <= 0 || index > MAX_INDEX) {
      skipped.push({ championKey: u.championKey, reason: `index ${index} out of byte range` });
      continue;
    }
    exportable.push({ position: u.position, championKey: u.championKey, index });
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
  exportable.sort((a, b) => a.position - b.position);

  if (exportable.length > SLOT_COUNT) {
    const overflow = exportable.length - SLOT_COUNT;
    console.warn(
      `[planner-code] board has ${exportable.length} valid units; dropping ${overflow} ` +
      "beyond the planner's 10-slot maximum"
    );
  }
  const toExport = exportable.slice(0, SLOT_COUNT);

  // ── Phase 3: emit 1-byte slots, pad to 10 ────────────────────────────────
  const slots: string[] = toExport.map((u) =>
    u.index.toString(16).padStart(SLOT_HEX_CHARS, "0").toUpperCase()
  );
  while (slots.length < SLOT_COUNT) slots.push(EMPTY_SLOT);

  const code = `${VERSION_PREFIX}${slots.join("")}TFTSet${setNumber}`;

  // ── Phase 4: self-validate ──────────────────────────────────────────────
  if (!PLANNER_CODE_RE.test(code)) {
    return {
      ok: false,
      error: "Internal error: generated code failed self-validation.",
    };
  }

  // Support-friendly debug log.
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
 * Decode a v01 planner code back into champion entries.
 *
 * Returns `{ ok: false }` for any input that doesn't match the canonical
 * format. Whitespace-tolerant and case-insensitive on the hex bytes.
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
        'Code must be "01<20 hex chars>TFTSet<N>" — got ' +
        `${trimmed.slice(0, 10)}…(${trimmed.length} chars)`,
    };
  }
  const hex = match[1];
  const set = parseInt(match[2], 10);

  // Reverse map (index → apiName) built once per decode.
  const reverse = new Map<number, string>();
  for (const [apiName, index] of plannerCodeMap) {
    if (index > 0 && index <= MAX_INDEX) reverse.set(index, apiName);
  }

  const units: DecodedPlannerUnit[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const byteHex = hex.substring(slot * SLOT_HEX_CHARS, (slot + 1) * SLOT_HEX_CHARS);
    const byte = parseInt(byteHex, 16);
    if (byte === 0) continue; // empty slot
    const championKey = reverse.get(byte);
    if (!championKey) {
      console.warn(
        `[planner-code] unknown index ${byte} in slot ${slot} (set ${set})`
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
// Verifies the codec against the gist's worked example AND a roundtrip on
// a synthetic 3-unit fixture. Gated on `process.env.NODE_ENV !==
// "production"` so Vite strips this block from production bundles.

if (
  typeof process !== "undefined" &&
  process.env?.NODE_ENV !== "production" &&
  typeof globalThis !== "undefined"
) {
  try {
    // Fixture A: gist's documented Set 13 example.
    //   010102030405060708090ATFTSet13
    //   → indices 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    // We don't need real Set 13 character_ids here — the decoder just
    // verifies the byte → reverse-map lookup works.
    const fixtureMap: PlannerCodeMap = new Map([
      ["TFTSet13_Akali", 1],
      ["TFTSet13_Ambessa", 2],
      ["TFTSet13_Amumu", 3],
      ["TFTSet13_Annie", 4],
      ["TFTSet13_Camille", 5],
      ["TFTSet13_Cassiopeia", 6],
      ["TFTSet13_Corki", 7],
      ["TFTSet13_Darius", 8],
      ["TFTSet13_DrMundo", 9],
      ["TFTSet13_Ekko", 10],
    ]);
    const gistExample = "010102030405060708090ATFTSet13";
    const decA = decodePlannerCode(gistExample, fixtureMap);
    if (!decA.ok) {
      console.error("[planner-code self-test A] decode of gist example failed:", decA.error);
    } else if (decA.payload.set !== 13 || decA.payload.units.length !== 10) {
      console.error("[planner-code self-test A] decoded wrong shape:", decA.payload);
    } else {
      console.debug(
        `[planner-code self-test A] decoded gist example: set=${decA.payload.set}, ` +
        `${decA.payload.units.length} units`
      );
    }

    // Fixture B: encode a board → decode → assert identity.
    const setSeventeenMap: PlannerCodeMap = new Map([
      ["TFT17_Aatrox", 1],
      ["TFT17_Akali", 2],
      ["TFT17_Galio", 16],
    ]);
    const fixtureUnits: BoardUnit[] = [
      { id: "a", championKey: "TFT17_Aatrox", position: 3, items: [], starLevel: 1, isCarry: false, isItemHolder: false },
      { id: "b", championKey: "TFT17_Akali", position: 10, items: [], starLevel: 2, isCarry: false, isItemHolder: false },
      { id: "c", championKey: "TFT17_Galio", position: 24, items: [], starLevel: 3, isCarry: false, isItemHolder: false },
    ];
    const encB = generatePlannerCode(fixtureUnits, 17, setSeventeenMap);
    if (!encB.ok) {
      console.error("[planner-code self-test B] encode failed:", encB.error);
    } else {
      // Aatrox at pos 3 → index 1 → byte 01
      // Akali  at pos 10 → index 2 → byte 02
      // Galio  at pos 24 → index 16 → byte 10
      // Slots: 01 02 10 00 00 00 00 00 00 00 → 20-char middle
      // Full:  "01" prefix + 20-char middle + "TFTSet17" suffix = 30 chars
      const expected = "0101021000000000000000TFTSet17";
      const okShape = encB.code === expected;
      const okLength = encB.code.length === 30;
      const okSuffix = encB.code.endsWith("TFTSet17");
      const okPrefix = encB.code.startsWith("01");
      const decB = decodePlannerCode(encB.code, setSeventeenMap);
      const okRoundtrip = decB.ok && decB.payload.set === 17 && decB.payload.units.length === 3;
      if (okShape && okLength && okSuffix && okPrefix && okRoundtrip) {
        console.debug("[planner-code self-test B] roundtrip OK:", encB.code);
      } else {
        console.error("[planner-code self-test B] roundtrip MISMATCH", {
          code: encB.code,
          expected,
          okShape,
          okLength,
          okSuffix,
          okPrefix,
          okRoundtrip,
          decoded: decB.ok ? decB.payload : (decB as { ok: false; error: string }).error,
        });
      }
    }
  } catch (e) {
    console.error("[planner-code self-test] threw:", e);
  }
}
