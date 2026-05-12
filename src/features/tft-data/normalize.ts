import type { TFTChampion, TFTItem, TFTTrait, TFTSetData } from "./types";
import { championIconUrl, itemIconUrl, traitIconUrl } from "./cdn";

// ---------------------------------------------------------------------------
// Raw CommunityDragon shapes (minimal — only the fields we use)
// ---------------------------------------------------------------------------

export type RawChampion = {
  apiName: string;
  characterName?: string;
  name: string;
  cost: number;
  traits: string[];
  squareIconPath: string;
  tileIconPath?: string;
};

export type RawTrait = {
  apiName: string;
  name: string;
  icon: string;
};

export type RawSet = {
  number: number;
  name: string;
  mutator?: string;
  champions?: RawChampion[];
  traits?: RawTrait[];
};

export type RawItem = {
  apiName: string;
  name: string;
  icon: string;
  id?: number;
  composition?: string[];
  associatedTraits?: string[];
  incompatibleTraits?: string[];
  isEmblem?: boolean;
  unique?: boolean;
};

export type RawTFTData = {
  setData?: RawSet[];
  items?: RawItem[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick the latest set that has real champion data (≥ 10 champions).
 * Falls back to the last entry if nothing qualifies.
 */
function pickLatestSet(sets: RawSet[]): RawSet | undefined {
  for (let i = sets.length - 1; i >= 0; i--) {
    if ((sets[i].champions?.length ?? 0) >= 10) return sets[i];
  }
  return sets.at(-1);
}

/** Decide whether an item should appear in the builder. */
function isUsableItem(item: RawItem): boolean {
  if (!item.icon || !item.apiName || !item.name.trim()) return false;
  const api = item.apiName;
  if (api.includes("_placeholder")) return false;
  if (api.includes("Tutorial")) return false;
  if (api.includes("Debug")) return false;
  // Augments are not equippable items in the board sense
  if (api.includes("Augment")) return false;
  // Radiant / Ornn items are valid — keep them
  return true;
}

/** Classify a raw item into component / emblem / combined. */
function classifyItem(item: RawItem): { isComponent: boolean; isEmblem: boolean } {
  const isEmblem =
    item.isEmblem === true ||
    item.apiName.toLowerCase().includes("emblem") ||
    (item.associatedTraits?.length ?? 0) > 0;

  // A component has no composition (it IS one of the building blocks)
  const isComponent = !isEmblem && (item.composition?.length ?? 0) === 0;

  return { isComponent, isEmblem };
}

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

export function normalizeSetData(raw: RawTFTData): TFTSetData {
  const sets = raw.setData ?? [];
  const latestSet = pickLatestSet(sets);

  const champions: TFTChampion[] = (latestSet?.champions ?? [])
    .filter((c) => c.cost >= 1 && c.cost <= 5 && c.name)
    .map((c) => {
      // Prefer squareIconPath; fall back to tileIconPath for newer sets
      const iconPath = c.squareIconPath || c.tileIconPath || "";
      return {
        apiName: c.apiName,
        characterName: c.characterName ?? c.apiName,
        name: c.name,
        cost: c.cost,
        traits: c.traits ?? [],
        squareIconPath: iconPath,
        iconUrl: championIconUrl(iconPath),
      };
    });

  const traits: TFTTrait[] = (latestSet?.traits ?? [])
    .filter((t) => t.icon && t.apiName && t.name)
    .map((t) => ({
      apiName: t.apiName,
      name: t.name,
      iconPath: t.icon,
      iconUrl: traitIconUrl(t.icon),
    }));

  const items: TFTItem[] = (raw.items ?? [])
    .filter(isUsableItem)
    .map((i) => {
      const { isComponent, isEmblem } = classifyItem(i);
      return {
        apiName: i.apiName,
        name: i.name,
        iconPath: i.icon,
        iconUrl: itemIconUrl(i.icon),
        isComponent,
        isEmblem,
        composition: i.composition ?? [],
      };
    });

  return {
    setNumber: latestSet?.number ?? 0,
    setName: latestSet?.name ?? "",
    champions,
    traits,
    items,
  };
}
