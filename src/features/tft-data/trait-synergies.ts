import type { TFTChampion, TFTTrait, TraitBreakpoint } from "./types";

// ---------------------------------------------------------------------------
// Active trait computation
// ---------------------------------------------------------------------------

export type ActiveTrait = {
  trait: TFTTrait;
  unitCount: number;
  /** Highest breakpoint that is currently satisfied (null = trait is inactive). */
  activeBp: TraitBreakpoint | null;
  /** Next breakpoint not yet reached (null = already at max tier). */
  nextBp: TraitBreakpoint | null;
};

const TIER_PRIORITY: Record<TraitBreakpoint["tier"], number> = {
  prismatic: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
};

/**
 * Compute active trait synergies from a list of units on the board.
 *
 * Units with no matching champion in `championMap` are ignored.
 * Traits that have no breakpoints at all are excluded from the result.
 *
 * The returned list is sorted:
 *   1. Active traits first, descending by tier priority, then by unit count.
 *   2. Inactive traits (unitCount < first breakpoint) last, by unit count desc.
 */
export function computeActiveTraits(
  units: { championKey: string }[],
  championMap: Map<string, TFTChampion>,
  traitMap: Map<string, TFTTrait>
): ActiveTrait[] {
  // Count units contributing to each trait
  const counts = new Map<string, number>();
  for (const unit of units) {
    const champion = championMap.get(unit.championKey);
    if (!champion) continue;
    for (const traitApiName of champion.traits) {
      counts.set(traitApiName, (counts.get(traitApiName) ?? 0) + 1);
    }
  }

  const result: ActiveTrait[] = [];

  for (const [traitApiName, unitCount] of counts) {
    const trait = traitMap.get(traitApiName);
    // Skip traits missing from the trait map or with no breakpoints
    if (!trait || trait.breakpoints.length === 0) continue;

    // Breakpoints are already sorted by minUnits in normalize.ts
    const sorted = [...trait.breakpoints].sort((a, b) => a.minUnits - b.minUnits);

    let activeBp: TraitBreakpoint | null = null;
    let nextBp: TraitBreakpoint | null = null;

    for (const bp of sorted) {
      if (unitCount >= bp.minUnits) {
        activeBp = bp;
      } else if (nextBp === null) {
        nextBp = bp;
      }
    }

    result.push({ trait, unitCount, activeBp, nextBp });
  }

  result.sort((a, b) => {
    const aTier = a.activeBp ? TIER_PRIORITY[a.activeBp.tier] : 0;
    const bTier = b.activeBp ? TIER_PRIORITY[b.activeBp.tier] : 0;
    if (aTier !== bTier) return bTier - aTier;
    return b.unitCount - a.unitCount;
  });

  return result;
}

/**
 * Returns only the traits that have at least one breakpoint active.
 */
export function getActiveTraitsOnly(
  units: { championKey: string }[],
  championMap: Map<string, TFTChampion>,
  traitMap: Map<string, TFTTrait>
): ActiveTrait[] {
  return computeActiveTraits(units, championMap, traitMap).filter(
    (at) => at.activeBp !== null
  );
}
