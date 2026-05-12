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

export type RawPlannerChampion = {
  id: number;
  apiName: string;
  name: string;
};

export type RawPlannerData = RawPlannerChampion[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SET17_PREFIX = "TFT17_";

/** Decide whether an item should appear in the builder. */
function isUsableItem(item: RawItem): boolean {
  if (!item.icon || !item.apiName || !item.name.trim()) return false;
  const api = item.apiName;
  if (api.includes("_placeholder")) return false;
  if (api.includes("Tutorial")) return false;
  if (api.includes("Debug")) return false;
  if (api.includes("Augment")) return false;
  return true;
}

/** Classify a raw item into component / emblem / combined. */
function classifyItem(item: RawItem): { isComponent: boolean; isEmblem: boolean } {
  const isEmblem =
    item.isEmblem === true ||
    item.apiName.toLowerCase().includes("emblem") ||
    (item.associatedTraits?.length ?? 0) > 0;

  const isComponent = !isEmblem && (item.composition?.length ?? 0) === 0;

  return { isComponent, isEmblem };
}

// ---------------------------------------------------------------------------
// Planner data enrichment
// ---------------------------------------------------------------------------

export function enrichWithPlannerData(
  champions: TFTChampion[],
  plannerData: RawPlannerData
): TFTChampion[] {
  const plannerMap = new Map(plannerData.map((p) => [p.apiName, p.id]));
  return champions.map((c) => {
    const plannerId = plannerMap.get(c.apiName);
    return plannerId !== undefined ? { ...c, plannerId } : c;
  });
}

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

export function normalizeSetData(raw: RawTFTData): TFTSetData {
  const sets = raw.setData ?? [];

  // Collect all champions across all sets, deduplicate by apiName
  const seen = new Set<string>();
  const allChampions: RawChampion[] = [];
  for (const set of sets) {
    for (const c of set.champions ?? []) {
      if (!seen.has(c.apiName)) {
        seen.add(c.apiName);
        allChampions.push(c);
      }
    }
  }

  let skippedCount = 0;

  const champions: TFTChampion[] = allChampions
    .filter((c) => {
      if (!c.apiName.startsWith(SET17_PREFIX)) {
        skippedCount++;
        return false;
      }
      if (c.cost < 1 || c.cost > 5 || !c.name) {
        skippedCount++;
        return false;
      }
      return true;
    })
    .map((c) => {
      const iconPath = c.squareIconPath || c.tileIconPath || "";
      const iconUrl = championIconUrl(iconPath);
      if (!iconPath) {
        console.warn(`[TFT] Missing icon for ${c.apiName}`);
      }
      return {
        apiName: c.apiName,
        characterName: c.characterName ?? c.apiName,
        name: c.name,
        cost: c.cost,
        traits: c.traits ?? [],
        squareIconPath: iconPath,
        iconUrl,
      };
    });

  if (skippedCount > 0) {
    console.info(`[TFT] Skipped ${skippedCount} champions (not TFT17_ or invalid)`);
  }
  console.info(`[TFT] Loaded ${champions.length} Set 17 champions`);

  // Find the Set 17 set entry for traits and metadata
  const set17 = sets.find(
    (s) =>
      s.number === 17 ||
      (s.champions ?? []).some((c) => c.apiName.startsWith(SET17_PREFIX))
  );

  const traits: TFTTrait[] = (set17?.traits ?? [])
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
    setNumber: set17?.number ?? 17,
    setName: set17?.name ?? "Set 17",
    champions,
    traits,
    items,
  };
}
