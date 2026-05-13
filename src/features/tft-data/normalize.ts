import type { TFTChampion, TFTItem, TFTItemCategory, TFTTrait, TFTSetData, TraitBreakpoint } from "./types";
import { championIconUrl, itemIconUrl, traitIconUrl, rerollCdnChampionUrl } from "./cdn";

// ---------------------------------------------------------------------------
// Raw CommunityDragon shapes
// ---------------------------------------------------------------------------

export type RawChampion = {
  apiName: string;
  characterName?: string;
  name: string;
  cost: number;
  traits: string[];
  // CDragon uses "squareIcon" (not squareIconPath) in the tft/en_us.json setData
  squareIcon?: string;
  squareIconPath?: string; // legacy field name, kept for compatibility
  icon?: string;
  tileIcon?: string;
};

export type RawTraitEffect = {
  minUnits: number;
  maxUnits?: number;
  style: number;
  variables?: Record<string, number>;
};

export type RawTrait = {
  apiName: string;
  name: string;
  icon: string;
  effects?: RawTraitEffect[];
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
  // Some CDragon versions expose a tags array; used for category hints when present.
  tags?: string[];
};

export type RawTFTData = {
  setData?: RawSet[];
  items?: RawItem[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_SET = 17;

// ---------------------------------------------------------------------------
// Trait tier mapping
// ---------------------------------------------------------------------------

// CDragon encodes tier quality as a numeric `style` value on each effect.
// Set 17 (and most recent sets) uses: 1=bronze, 3=silver, 5=gold, 7=prismatic.
// Older sets sometimes use 1/2/3/4 — the positional fallback handles those.
const STYLE_TO_TIER: Record<number, TraitBreakpoint["tier"]> = {
  1: "bronze",
  2: "silver",
  3: "silver",
  4: "gold",
  5: "gold",
  6: "prismatic",
  7: "prismatic",
  8: "prismatic",
};

const POSITIONAL_TIERS: TraitBreakpoint["tier"][] = [
  "bronze",
  "silver",
  "gold",
  "prismatic",
];

function styleToTier(style: number, fallbackIndex: number): TraitBreakpoint["tier"] {
  return (
    STYLE_TO_TIER[style] ??
    POSITIONAL_TIERS[Math.min(fallbackIndex, POSITIONAL_TIERS.length - 1)]
  );
}

function normalizeBreakpoints(effects: RawTraitEffect[]): TraitBreakpoint[] {
  const sorted = [...effects].sort((a, b) => a.minUnits - b.minUnits);
  return sorted.map((e, i) => {
    const bp: TraitBreakpoint = {
      minUnits: e.minUnits,
      tier: styleToTier(e.style, i),
    };
    // Include maxUnits only when CDragon supplies a meaningful upper bound.
    // Sentinel values (0 or ≥9999) indicate "no cap" and are omitted.
    if (e.maxUnits !== undefined && e.maxUnits !== null && e.maxUnits > e.minUnits && e.maxUnits < 9999) {
      bp.maxUnits = e.maxUnits;
    }
    return bp;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUsableItem(item: RawItem): boolean {
  if (!item.icon || !item.apiName || !item.name?.trim()) return false;
  const api = item.apiName;
  return (
    !api.includes("_placeholder") &&
    !api.includes("Tutorial") &&
    !api.includes("Debug") &&
    !api.includes("Augment") &&
    !api.includes("_Tactician") &&
    !api.includes("_Consumable")
  );
}

/**
 * Determine item category from CDragon fields.
 *
 * Priority order:
 *   1. Emblem   — isEmblem flag OR associatedTraits present
 *   2. Radiant  — "Radiant" in apiName or name
 *   3. Artifact — "Ornn" or "Artifact" in apiName (Ornn / Artifact items)
 *   4. Component — appears as an ingredient in another item's composition array
 *   5. Normal   — everything else (assembled non-radiant non-artifact items)
 *
 * The `tags` array (present in some CDragon versions) is checked as a secondary
 * signal for radiant/artifact detection.
 */
function categorizeItem(
  item: RawItem,
  componentApiNames: Set<string>
): TFTItemCategory {
  const api = item.apiName.toLowerCase();
  const name = item.name.toLowerCase();
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());

  // 1. Emblem
  if (
    item.isEmblem ||
    (item.associatedTraits?.length ?? 0) > 0 ||
    api.includes("emblem") ||
    tags.includes("emblem")
  ) {
    return "emblem";
  }

  // 2. Radiant
  if (
    api.includes("radiant") ||
    name.startsWith("radiant ") ||
    tags.includes("radiant")
  ) {
    return "radiant";
  }

  // 3. Artifact (Ornn items + items explicitly tagged as artifacts)
  if (
    api.includes("ornn") ||
    api.includes("artifact") ||
    tags.includes("artifact") ||
    tags.includes("ornn")
  ) {
    return "artifact";
  }

  // 4. Component — data-driven: only items actually used as ingredients elsewhere
  if ((item.composition?.length ?? 0) === 0 && componentApiNames.has(item.apiName)) {
    return "component";
  }

  // 5. Normal
  return "normal";
}

function getBestIconPath(c: RawChampion): string {
  // CDragon tft/en_us.json uses "squareIcon" for the portrait-sized image.
  // Fall back to "icon" (splash art) or "tileIcon" if unavailable.
  return c.squareIcon || c.squareIconPath || c.icon || c.tileIcon || "";
}

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

export function normalizeSetData(raw: RawTFTData): TFTSetData {
  const sets = raw.setData ?? [];

  // Find Set 17 explicitly — do NOT scan global arrays or other sets
  const set17 = sets.find((s) => s.number === CURRENT_SET);

  if (!set17) {
    const available = sets.map((s) => s.number).join(", ");
    console.warn(
      `[TFT] Set ${CURRENT_SET} not found in setData. Available sets: ${available}`
    );
  }

  const rawChampions = set17?.champions ?? [];
  let skipped = 0;

  const champions: TFTChampion[] = rawChampions
    .filter((c) => {
      // Keep cost 1-5 playable champions only.
      // This naturally excludes Training Dummy (cost 0 or non-standard),
      // Blue Golem, Rift Scuttler, and other non-playable entries.
      if (!c.apiName || !c.name || c.cost < 1 || c.cost > 5) {
        skipped++;
        return false;
      }
      return true;
    })
    .map((c) => {
      const iconPath = getBestIconPath(c);
      const iconUrl = championIconUrl(iconPath);
      const fallbackIconUrl = rerollCdnChampionUrl(c.name);

      if (!iconPath) {
        console.warn(`[TFT] No icon path for ${c.apiName} (${c.name})`);
      }

      return {
        apiName: c.apiName,
        characterName: c.characterName ?? c.apiName,
        name: c.name,
        cost: c.cost,
        traits: c.traits ?? [],
        squareIconPath: iconPath,
        iconUrl,
        fallbackIconUrl,
      };
    });

  console.info(
    `[TFT] Set ${CURRENT_SET}: ${champions.length} champions loaded, ${skipped} skipped`
  );

  // Build a set of trait apiNames that have a corresponding emblem item.
  // Emblem items carry an `associatedTraits` array pointing to trait apiNames.
  const emblemTraitNames = new Set<string>();
  for (const item of raw.items ?? []) {
    if (
      item.isEmblem ||
      item.apiName.toLowerCase().includes("emblem")
    ) {
      for (const traitApiName of item.associatedTraits ?? []) {
        emblemTraitNames.add(traitApiName);
      }
    }
  }

  const traits: TFTTrait[] = (set17?.traits ?? [])
    .filter((t) => t.icon && t.apiName && t.name)
    .map((t) => ({
      apiName: t.apiName,
      name: t.name,
      iconPath: t.icon,
      iconUrl: traitIconUrl(t.icon),
      breakpoints: normalizeBreakpoints(t.effects ?? []),
      hasEmblem: emblemTraitNames.has(t.apiName),
    }));

  // Pass 1: collect every apiName that appears as a composition ingredient.
  // This is the data-driven way to identify true components vs. special no-recipe items.
  const componentApiNames = new Set<string>();
  for (const item of raw.items ?? []) {
    for (const ingredient of item.composition ?? []) {
      componentApiNames.add(ingredient);
    }
  }

  const usableRawItems = (raw.items ?? []).filter(isUsableItem);
  let uncategorized = 0;

  // Pass 2: normalize each item with a stable category derived from CDragon fields.
  const items: TFTItem[] = usableRawItems.map((i) => {
    const category = categorizeItem(i, componentApiNames);

    if (category === "normal" && (i.composition?.length ?? 0) === 0 && !componentApiNames.has(i.apiName)) {
      // Item has no composition and is not used as an ingredient — likely a special/
      // consumable that slipped past the filter. Log it for visibility.
      uncategorized++;
      console.warn(`[TFT] Possibly uncategorized item: ${i.apiName} "${i.name}"`);
    }

    return {
      apiName: i.apiName,
      name: i.name,
      iconPath: i.icon,
      iconUrl: itemIconUrl(i.icon),
      category,
      composition: i.composition ?? [],
      ...(category === "emblem" && (i.associatedTraits?.length ?? 0) > 0
        ? { associatedTrait: i.associatedTraits![0] }
        : {}),
    };
  });

  if (uncategorized > 0) {
    console.info(`[TFT] ${uncategorized} items fell through to "normal" with no recipe — review filter rules`);
  }

  console.info(
    `[TFT] Items: ${items.length} total | ` +
    Object.entries(
      items.reduce((acc, i) => { acc[i.category] = (acc[i.category] ?? 0) + 1; return acc; },
      {} as Record<string, number>)
    ).map(([k, v]) => `${k}=${v}`).join(", ")
  );

  return {
    setNumber: CURRENT_SET,
    setName: set17?.name ?? `Set ${CURRENT_SET}`,
    champions,
    traits,
    items,
  };
}
