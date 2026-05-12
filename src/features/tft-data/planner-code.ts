/**
 * TFT Planner Code codec — isolated, no React / UI dependencies.
 *
 * Format: base64url( JSON.stringify(PlannerPayload) )
 * Full spec: docs/PLANNER_CODE_CONTEXT.md
 */

import type { BoardUnit } from "@/features/board-builder/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlannerUnit = {
  id: string;        // champion apiName
  pos: number;       // 0-27
  star: 1 | 2 | 3;
  items: string[];   // item apiNames, max 3
};

export type PlannerPayload = {
  v: 1;
  set: number;
  units: PlannerUnit[];
};

export type PlannerResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Generate a planner code from a list of board units.
 *
 * All units are included. Unknown `championKey` values are skipped with a
 * warning rather than failing the whole encode, so a partially-known board
 * still produces a usable code.
 *
 * Returns `{ ok: false }` only when the board is empty (nothing to encode).
 */
export function generatePlannerCode(
  units: BoardUnit[],
  setNumber: number
): PlannerResult {
  if (units.length === 0) {
    return { ok: false, error: "Board is empty — add at least one champion." };
  }

  const plannerUnits: PlannerUnit[] = units
    .filter((u) => u.position >= 0 && u.position <= 27)
    .map((u) => ({
      id: u.championKey,
      pos: u.position,
      star: clampStar(u.starLevel),
      items: (u.items ?? []).slice(0, 3),
    }));

  if (plannerUnits.length === 0) {
    return { ok: false, error: "No valid units to encode." };
  }

  const payload: PlannerPayload = {
    v: 1,
    set: setNumber,
    units: plannerUnits,
  };

  const code = base64urlEncode(JSON.stringify(payload));
  return { ok: true, code };
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Decode a planner code back into its payload.
 * Returns `{ ok: false }` for any malformed input.
 */
export function decodePlannerCode(code: string): { ok: true; payload: PlannerPayload } | { ok: false; error: string } {
  try {
    const json = base64urlDecode(code);
    const payload = JSON.parse(json) as unknown;
    if (!isValidPayload(payload)) {
      return { ok: false, error: "Unrecognised planner code format." };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Failed to decode planner code." };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampStar(star: number | undefined): 1 | 2 | 3 {
  if (star === 2) return 2;
  if (star === 3) return 3;
  return 1;
}

function base64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(code: string): string {
  const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isValidPayload(value: unknown): value is PlannerPayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p["v"] === 1 &&
    typeof p["set"] === "number" &&
    Array.isArray(p["units"])
  );
}
