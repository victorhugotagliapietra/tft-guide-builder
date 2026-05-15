/**
 * TFT in-game team-planner code codec.
 *
 * Emits codes that paste DIRECTLY into the TFT client's Team Planner UI.
 * This is the actual Riot format, not a custom JSON+base64 codec — the
 * previous implementation produced strings the in-game planner couldn't
 * read.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FORMAT
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   02 + <28 × 2 hex chars> + TFTSet<N>
 *
 *   - "02" is the format version byte (constant for Set 9+)
 *   - 28 bytes of board state, one per hex position (row * 7 + col, 0–27).
 *     Each byte is the champion's `team_planner_code` from CDragon's
 *     `tftchampions-teamplanner.json` (Set 17 codes range 0–104, fit in
 *     1 byte). Empty positions are 0x00.
 *   - "TFTSet<N>" is a literal suffix; N is the set number. The TFT client
 *     uses this suffix to pick the right per-set champion lookup table.
 *
 * Example (1 unit at position 3, code 0x12 = 18 → Jinx, Set 17):
 *
 *   02000000120000000000000000000000000000000000000000000000TFTSet17
 *
 * Total length for Set 17: 2 + 56 + 8 = 66 chars.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IS LOST
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The in-game format encodes ONLY champion positions. It does NOT preserve
 * star level, equipped items, or augments. That's a limitation of the TFT
 * client, not this implementation. The original `BoardUnit` data stays
 * intact in the guide; the planner code is just one export view of it.
 *
 * For richer roundtripping (full unit state across sessions), use the
 * existing JSONB serialization that backs `board_steps`.
 */

import type { BoardUnit } from "@/features/board-builder/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlannerResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/** apiName → team_planner_code byte value (from CDragon team-planner JSON). */
export type PlannerCodeMap = Map<string, number>;

export type DecodedPlannerUnit = {
  championKey: string; // apiName
  position: number;    // 0–27
};

export type DecodedPlannerPayload = {
  set: number;
  units: DecodedPlannerUnit[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERSION_PREFIX = "02";
const BOARD_POSITIONS = 28;
const HEX_CHARS_PER_POSITION = 2; // 1 byte
const HEX_PAYLOAD_LENGTH = BOARD_POSITIONS * HEX_CHARS_PER_POSITION; // 56

// "02" + 56 hex + "TFTSet<digits>". Whitespace-tolerant, case-insensitive hex.
const PLANNER_CODE_RE = /^02([0-9A-Fa-f]{56})TFTSet(\d+)$/;

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Generate a TFT in-game team-planner code from a list of board units.
 *
 * Behavior:
 *   - Empty board → returns `{ ok: false, error }`.
 *   - Each unit with a valid position + known `team_planner_code` is placed
 *     into its hex byte slot.
 *   - Units missing from the planner map (e.g. Training Dummy, NPCs) are
 *     skipped with a console.warn — the code still emits as long as at
 *     least one unit encoded successfully.
 *   - Star levels and item assignments are dropped; the in-game format
 *     doesn't carry that info.
 *   - Output is canonical: uppercase hex, single line, no whitespace.
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
      error:
        "Team-planner data isn't loaded yet — try again in a moment.",
    };
  }

  // 28 bytes, all empty (0x00) by default.
  const bytes = new Array<number>(BOARD_POSITIONS).fill(0);
  let encoded = 0;
  const skipped: string[] = [];
  const collisions: number[] = [];

  for (const u of units) {
    if (!Number.isInteger(u.position) || u.position < 0 || u.position >= BOARD_POSITIONS) {
      skipped.push(`${u.championKey}@pos=${u.position}`);
      continue;
    }
    const code = plannerCodeMap.get(u.championKey);
    if (typeof code !== "number") {
      // Most likely Training Dummy or another non-playable unit Riot doesn't
      // expose to the in-game planner. Quiet warn — not fatal.
      console.warn(
        `[planner-code] no team_planner_code for ${u.championKey}; skipping`
      );
      skipped.push(u.championKey);
      continue;
    }
    if (code < 0 || code > 255) {
      console.warn(
        `[planner-code] team_planner_code ${code} for ${u.championKey} ` +
        `is outside the 0–255 byte range; skipping`
      );
      skipped.push(`${u.championKey}(${code})`);
      continue;
    }
    if (code === 0) {
      // 0x00 is the "empty position" sentinel in the byte stream. Any champion
      // assigned code 0 (e.g. the Set 17 enemy-Aatrox NPC) collides with the
      // empty marker and can't be encoded. Skip and warn.
      console.warn(
        `[planner-code] ${u.championKey} has reserved code 0; skipping`
      );
      skipped.push(`${u.championKey}(0)`);
      continue;
    }
    if (bytes[u.position] !== 0) {
      collisions.push(u.position);
    }
    bytes[u.position] = code;
    encoded++;
  }

  if (encoded === 0) {
    return {
      ok: false,
      error:
        "No champions on the board are exportable to the in-game planner " +
        "(missing team_planner_code values).",
    };
  }

  const hex = bytes
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  const code = `${VERSION_PREFIX}${hex}TFTSet${setNumber}`;

  // Debug log so we can inspect what was emitted while developing / supporting.
  console.debug(
    `[planner-code] generated ${code} (encoded=${encoded}, ` +
    `skipped=${skipped.length}${collisions.length ? `, collisions=${collisions.length}` : ""})`
  );

  // Sanity check before returning — guarantees we never hand the user a code
  // that can't roundtrip back through our own decoder.
  if (!PLANNER_CODE_RE.test(code)) {
    return {
      ok: false,
      error: "Internal error: generated code failed self-validation.",
    };
  }

  return { ok: true, code };
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Decode a TFT in-game team-planner code into champion positions.
 *
 * Tolerant of whitespace + mixed case. Returns `{ ok: false }` for any input
 * that doesn't match the canonical format (so callers can show a helpful
 * "this doesn't look like a planner code" message instead of crashing).
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
        'Code must be "02<56 hex chars>TFTSet<N>" — got ' +
        `${trimmed.slice(0, 8)}…(${trimmed.length} chars)`,
    };
  }
  const hex = match[1];
  const set = parseInt(match[2], 10);

  // Build reverse map (code → apiName) once per decode. The map is small
  // (~60 entries), so the cost is negligible vs. caching complexity.
  const reverse = new Map<number, string>();
  for (const [apiName, byteCode] of plannerCodeMap) {
    if (byteCode > 0 && byteCode <= 255) reverse.set(byteCode, apiName);
  }

  const units: DecodedPlannerUnit[] = [];
  for (let pos = 0; pos < BOARD_POSITIONS; pos++) {
    const byte = parseInt(hex.substring(pos * 2, pos * 2 + 2), 16);
    if (byte === 0) continue;
    const championKey = reverse.get(byte);
    if (!championKey) {
      console.warn(
        `[planner-code] unknown champion byte ${byte.toString(16).padStart(2, "0")} ` +
        `at position ${pos} (set ${set})`
      );
      continue;
    }
    units.push({ championKey, position: pos });
  }

  return { ok: true, payload: { set, units } };
}

// ---------------------------------------------------------------------------
// Self-test (development-only)
// ---------------------------------------------------------------------------
//
// Run an encode → decode roundtrip on a fixed fixture whenever this module
// loads in a development build. Surfaces format regressions immediately
// instead of waiting for someone to paste a real code into the client.
// Production builds (NODE_ENV === "production") skip the assertion.

if (
  typeof process !== "undefined" &&
  process.env?.NODE_ENV !== "production" &&
  typeof globalThis !== "undefined"
) {
  try {
    // Synthetic fixture: 3 units at positions 3, 10, 24. Codes chosen to
    // exercise the hex padding (one needs leading 0).
    const fixtureMap: PlannerCodeMap = new Map([
      ["TFT17_Jinx", 18],     // 0x12
      ["TFT17_Ahri", 1],      // 0x01 — tests single-digit padding
      ["TFT17_Galio", 39],    // 0x27
    ]);
    const fixtureUnits: BoardUnit[] = [
      { id: "a", championKey: "TFT17_Jinx", position: 3, items: [], starLevel: 2, isCarry: false, isItemHolder: false },
      { id: "b", championKey: "TFT17_Ahri", position: 10, items: [], starLevel: 1, isCarry: false, isItemHolder: false },
      { id: "c", championKey: "TFT17_Galio", position: 24, items: [], starLevel: 3, isCarry: false, isItemHolder: false },
    ];
    const enc = generatePlannerCode(fixtureUnits, 17, fixtureMap);
    if (!enc.ok) {
      console.error("[planner-code self-test] encode failed:", enc.error);
    } else {
      const dec = decodePlannerCode(enc.code, fixtureMap);
      if (!dec.ok) {
        console.error("[planner-code self-test] decode failed:", dec.error);
      } else {
        const okSet = dec.payload.set === 17;
        const okCount = dec.payload.units.length === 3;
        const okPositions = dec.payload.units
          .map((u) => `${u.championKey}@${u.position}`)
          .sort()
          .join(",") ===
          "TFT17_Ahri@10,TFT17_Galio@24,TFT17_Jinx@3";
        const okSuffix = enc.code.endsWith("TFTSet17");
        if (okSet && okCount && okPositions && okSuffix) {
          console.debug("[planner-code self-test] roundtrip OK:", enc.code);
        } else {
          console.error(
            "[planner-code self-test] roundtrip MISMATCH",
            { code: enc.code, decoded: dec.payload, okSet, okCount, okPositions, okSuffix }
          );
        }
      }
    }
  } catch (e) {
    console.error("[planner-code self-test] threw:", e);
  }
}
