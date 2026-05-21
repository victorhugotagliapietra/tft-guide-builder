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
 * `champion.traits` stores trait display names (e.g. "Primordian"), not the
 * trait apiName (e.g. "TFT17_Primordian"). We therefore look traits up by
 * BOTH apiName and display-name to be tolerant of either format coming from
 * future CDragon changes.
 *
 * Units with no matching champion in `championMap` are ignored. Traits with
 * no breakpoints are excluded.
 *
 * Sorted: active traits first (desc tier, desc unit count); inactive last.
 */
export function computeActiveTraits(
  units: { championKey: string }[],
  championMap: Map<string, TFTChampion>,
  traitMap: Map<string, TFTTrait>,
): ActiveTrait[] {
  // Build a secondary lookup keyed by display name so we can resolve the
  // tokens that champions carry on their `traits` array.
  const byName = new Map<string, TFTTrait>();
  for (const t of traitMap.values()) byName.set(t.name, t);

  const resolveTrait = (token: string): TFTTrait | undefined =>
    traitMap.get(token) ?? byName.get(token);

  // Deduplicate by championKey — placing the same champion twice should count
  // as one toward trait synergies, matching actual game rules.
  const seenKeys = new Set<string>();
  const dedupedUnits: { championKey: string }[] = [];
  for (const u of units) {
    if (!seenKeys.has(u.championKey)) {
      seenKeys.add(u.championKey);
      dedupedUnits.push(u);
    }
  }

  // Count units contributing to each trait (keyed by resolved apiName so
  // different display-name aliases don't double-count)
  const counts = new Map<string, number>();
  for (const unit of dedupedUnits) {
    const champion = championMap.get(unit.championKey);
    if (!champion) continue;
    for (const traitToken of champion.traits) {
      const trait = resolveTrait(traitToken);
      if (!trait) continue;
      counts.set(trait.apiName, (counts.get(trait.apiName) ?? 0) + 1);
    }
  }

  const result: ActiveTrait[] = [];

  for (const [traitApiName, unitCount] of counts) {
    const trait = traitMap.get(traitApiName);
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
  traitMap: Map<string, TFTTrait>,
): ActiveTrait[] {
  return computeActiveTraits(units, championMap, traitMap).filter((at) => at.activeBp !== null);
}
