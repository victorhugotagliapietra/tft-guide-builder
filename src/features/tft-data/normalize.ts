import type { TFTChampion, TFTItem, TFTItemCategory, TFTTrait, TFTSetData, TraitBreakpoint, ItemRole } from "./types";
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
  hidden?: boolean;
  // Some CDragon versions expose a tags array.
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

// Regex for universal TFT items (no set number — usable across all sets)
const UNIVERSAL_ITEM_RE = /^TFT_Item_/i;

// Current-set prefixes that flag an item as belonging to Set 17. Anima Squad
// uses a distinct prefix (TFT17_AnimaSquadItem_*) that does NOT contain "Item_"
// in its standard position — it must be allowed explicitly or all Anima Squad
// trait items get dropped by the prefix gate.
const CURRENT_SET_PREFIXES: RegExp[] = [
  new RegExp(`^TFT${CURRENT_SET}_Item_`, "i"),
  new RegExp(`^TFT${CURRENT_SET}_AnimaSquadItem_`, "i"),
];

// Substrings in apiName that always indicate non-equippable internal entries.
// Lowercased substrings — match against apiName.toLowerCase().
const ITEM_API_BLOCKLIST = [
  "_placeholder",
  "tutorial",
  "debug",
  "augment",                  // augments are a separate system
  "_chroma",                  // cosmetic chroma variants, not real items
  "_tactician",               // tactician items (cosmetic)
  "_consumable",              // consumables like Neeko's Help
  "vfx",                      // visual effect assets
  "_buff_",                   // in-game buff icons, not equippable items
  "_perk",                    // perk icons
  "_passive",                 // passive ability icons
  "_tooltip",                 // tooltip sprites
  "_temp",                    // temporary internal items
  "heroaugment",              // old TFT9 hero augment remnants
  "_icon_",                   // UI icon assets
  "training_",                // training mode dummies
  // Mode / UI / cosmetic blocklist:
  "modeicon",                 // game-mode selector icons
  "_mode_",                   // generic mode markers
  "replicator",               // Replicator Mode icon
  "conduitmode",              // Conduit Mode icon
  "challengermode",           // Challenger Mode icon
  "missfortuneunique",        // Set 17 MissFortune mode stance markers (Replicator / Conduit / Challenger Mode)
  "traitstance",              // stance toggles for traits — not real items
  "_orb",                     // orbs (loot orbs, Ornn orb mechanic)
  "anvil",                    // Ornn / item anvils
  "crown",                    // Tactician's / Strategist's Crown (cosmetic / special)
  "_slot",                    // internal RadiantSlot etc.
  "marketoffering",           // Set 17 market UI offerings (anvils / random rolls)
  "_assist_",                 // assist mode helper drops
  "spatula",                  // raw spatulas + spatula-extended legacy items
];

/**
 * Returns true only for valid equippable TFT items.
 *
 * Filtering strategy (in order):
 *   1. Must have apiName, name, and icon — basic presence check
 *   2. Must not be flagged `hidden: true` (internal CDragon flag)
 *   3. apiName must be TFT_Item_* (universal) or TFT{SET}_Item_* (current-set)
 *      — this single rule drops all legacy items from old sets automatically
 *   4. apiName must not match any known internal/non-equippable patterns
 *   5. Name must look like a real display name (not a path, not too short/long)
 *   6. Icon path must be an ASSETS path (not empty or a VFX chunk)
 */
function isUsableItem(item: RawItem): boolean {
  // Presence
  if (!item.apiName || !item.name?.trim() || !item.icon) return false;

  // Hidden/internal flag
  if (item.hidden) return false;

  // Prefix filter — drop everything that is not a universal or current-set item.
  // Current-set covers TFT17_Item_* AND TFT17_AnimaSquadItem_* (different prefix
  // shape, otherwise Anima Squad trait items would be dropped here).
  const isUniversal = UNIVERSAL_ITEM_RE.test(item.apiName);
  const isCurrentSet = CURRENT_SET_PREFIXES.some((re) => re.test(item.apiName));
  if (!isUniversal && !isCurrentSet) {
    return false;
  }

  // Blocklist check on lowercase apiName
  const apiLower = item.apiName.toLowerCase();
  if (ITEM_API_BLOCKLIST.some((bad) => apiLower.includes(bad))) {
    console.debug(`[TFT] Skipping blocked item: ${item.apiName}`);
    return false;
  }

  // Name sanity — must not look like a file path or internal ID
  const name = item.name.trim();
  if (name.length < 3 || name.length > 80) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (/^TFT[_\d]/i.test(name)) return false; // name that looks like an apiName

  // Icon must point to an ASSETS path
  if (!item.icon.toLowerCase().includes("assets/")) return false;

  return true;
}

// Artifact apiNames: universal pool (TFT_Item_Artifact_*) + current-set
// champion artifacts (TFT17_Item_Artifact_*). Older Ornn items used different
// naming and are excluded by these patterns.
const UNIVERSAL_ARTIFACT_RE = /^TFT_Item_Artifact_/i;
const CURRENT_SET_ARTIFACT_RE = new RegExp(`^TFT${CURRENT_SET}_Item_Artifact_`, "i");

// Items whose apiName ends with `_Radiant` are upgraded variants of trait
// items / artifacts. They are intentionally excluded from the catalog —
// the editor no longer surfaces radiant variants as a separate category.
const RADIANT_SUFFIX_RE = /_Radiant$/i;

// Specific artifacts that should never appear in the Artifact tab. Identified
// by exact apiName so the rule survives display-name changes.
const BLOCKED_ARTIFACT_APINAMES = new Set<string>([
  "TFT17_Item_Artifact_ZekesHeraldShadow", // "Zeke's Bleak Herald"
  "TFT_Item_Artifact_WitheringRelic",      // "Withered Relic"
  "TFT_Item_Artifact_CursedBlade",         // "Cursed Blade"
]);

// Current-set trait-item families: PsyOps and Anima Squad. We only accept
// these explicit families instead of "any current-set item not otherwise
// classified" so mode markers / stance toggles can't slip through.
const PSYOPS_ITEM_RE = new RegExp(`^TFT${CURRENT_SET}_Item_PsyOps_`, "i");
const ANIMA_SQUAD_ITEM_RE = new RegExp(`^TFT${CURRENT_SET}_AnimaSquadItem_`, "i");

// ---------------------------------------------------------------------------
// Normal-item role inference
// ---------------------------------------------------------------------------
//
// Each completed Normal item is a recipe of two components. The components
// strongly suggest a role bucket. We map component apiNames to a coarse
// "stat class" and derive the role from the pair. Component-based inference
// avoids parsing free-form stat blobs; a small overrides Map handles items
// whose effect/aura makes them feel different from their components.

type StatClass = "ad" | "ap" | "tear" | "armor" | "mr" | "hp" | "crit" | "other";

const COMPONENT_STAT_CLASS: Record<string, StatClass> = {
  TFT_Item_BFSword: "ad",
  TFT_Item_RecurveBow: "ad",
  TFT_Item_NeedlesslyLargeRod: "ap",
  TFT_Item_TearOfTheGoddess: "tear",
  TFT_Item_ChainVest: "armor",
  TFT_Item_NegatronCloak: "mr",
  TFT_Item_GiantsBelt: "hp",
  TFT_Item_SparringGloves: "crit",
};

// Apinames whose role isn't well-described by their composition (auras,
// utility effects, etc.). Keep this small and well-motivated.
const ITEM_ROLE_OVERRIDES: Record<string, ItemRole> = {
  TFT_Item_ZekesHerald: "support",  // mana-aura support item
  TFT_Item_BlueBuff: "ap",          // 2 tears but used by casters, not supports
  TFT_Item_ArchangelsStaff: "ap",   // tear + rod — caster scaling
  TFT_Item_ShojinsSpear: "fighter", // tear + bf — AD caster fighter
  TFT_Item_SpearOfShojin: "fighter",
};

function compClass(apiName: string): StatClass {
  return COMPONENT_STAT_CLASS[apiName] ?? "other";
}

/**
 * Derive a role bucket from the composition pair. Order:
 *   1. Hard override by apiName
 *   2. Two defensive components (armor/mr/hp) → tank
 *   3. Two tears OR rod + crit → ap
 *   4. Any tear → support
 *   5. Any rod → ap
 *   6. Any BF → fighter
 *   7. Fallback → flex
 */
function inferItemRole(apiName: string, composition: string[]): ItemRole {
  if (ITEM_ROLE_OVERRIDES[apiName]) return ITEM_ROLE_OVERRIDES[apiName];

  const classes = composition.map(compClass);
  const isDefensive = (c: StatClass) => c === "armor" || c === "mr" || c === "hp";
  const defensiveCount = classes.filter(isDefensive).length;

  if (defensiveCount >= 2) return "tank";

  const tears = classes.filter((c) => c === "tear").length;
  const hasRod = classes.includes("ap");
  const hasCrit = classes.includes("crit");
  if (tears === 2 || (hasRod && hasCrit)) return "ap";

  if (classes.includes("tear")) return "support";
  if (hasRod) return "ap";
  if (classes.includes("ad")) return "fighter";

  return "flex";
}

/**
 * Categorize a valid TFT item, or return null to drop it entirely.
 *
 * Priority order:
 *   1. Drop  _Radiant suffix items — upgraded variants are no longer surfaced
 *   2. Drop  blacklisted artifact apiNames (Zeke's Bleak Herald, Withered
 *           Relic, Cursed Blade)
 *   3. Emblem    — isEmblem flag OR "emblem" in apiName
 *   4. Artifact  — universal `TFT_Item_Artifact_*` OR `TFT{SET}_Item_Artifact_*`
 *   5. Trait     — current-set PsyOps OR AnimaSquad items
 *   6. Normal    — universal TFT_Item_* with composition.length >= 2
 *   null         — uncategorizable; logged and excluded
 */
function categorizeItem(item: RawItem): TFTItemCategory | null {
  const api = item.apiName;
  const apiLower = api.toLowerCase();

  // 1. Drop radiant variants entirely
  if (RADIANT_SUFFIX_RE.test(api)) {
    return null;
  }

  // 2. Drop specific blacklisted artifacts (still in CDragon, undesired in UI)
  if (BLOCKED_ARTIFACT_APINAMES.has(api)) {
    return null;
  }

  // 3. Emblem — flagged emblem OR "emblem" in apiName. The presence of
  // `associatedTraits` alone is NOT enough (trait items also reference traits).
  if (item.isEmblem || apiLower.includes("emblem")) {
    return "emblem";
  }

  // 4. Artifact — universal pool + current-set champion artifacts
  if (UNIVERSAL_ARTIFACT_RE.test(api) || CURRENT_SET_ARTIFACT_RE.test(api)) {
    return "artifact";
  }

  // 5. Trait — only explicit current-set trait families
  if (PSYOPS_ITEM_RE.test(api) || ANIMA_SQUAD_ITEM_RE.test(api)) {
    return "trait";
  }

  // 6. Normal — universal completed item (recipe of 2 components)
  if (
    UNIVERSAL_ITEM_RE.test(api) &&
    (item.composition?.length ?? 0) >= 2
  ) {
    return "normal";
  }

  return null;
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

  const rawItems = raw.items ?? [];
  const totalRaw = rawItems.length;

  const usableRawItems = rawItems.filter(isUsableItem);
  const filteredOut = totalRaw - usableRawItems.length;

  // Build by apiName to dedupe — raw data occasionally contains duplicate
  // entries (same apiName) from staging/PBE leftovers. First-seen wins.
  const seenApiNames = new Set<string>();
  let duplicates = 0;
  const items: TFTItem[] = [];
  let uncategorized = 0;
  let blockedArtifactsRemoved = 0;
  let radiantsRemoved = 0;

  for (const i of usableRawItems) {
    if (seenApiNames.has(i.apiName)) {
      duplicates++;
      continue;
    }
    seenApiNames.add(i.apiName);

    // Pre-count drops so the validation log is meaningful.
    if (RADIANT_SUFFIX_RE.test(i.apiName)) radiantsRemoved++;
    if (BLOCKED_ARTIFACT_APINAMES.has(i.apiName)) {
      blockedArtifactsRemoved++;
      console.debug(`[TFT] Blocked artifact removed: ${i.apiName} "${i.name}"`);
    }

    const category = categorizeItem(i);
    if (category === null) {
      uncategorized++;
      continue;
    }
    const composition = i.composition ?? [];
    items.push({
      apiName: i.apiName,
      name: i.name,
      iconPath: i.icon,
      iconUrl: itemIconUrl(i.icon),
      category,
      composition,
      ...(category === "normal"
        ? { role: inferItemRole(i.apiName, composition) }
        : {}),
      ...(category === "emblem" && (i.associatedTraits?.length ?? 0) > 0
        ? { associatedTrait: i.associatedTraits![0] }
        : {}),
    });
  }

  const categoryCounts = items.reduce(
    (acc, i) => { acc[i.category] = (acc[i.category] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  console.info(
    `[TFT] Items: ${items.length} kept / ${totalRaw} raw ` +
    `(${filteredOut} filtered, ${duplicates} duplicate apiNames, ${uncategorized} uncategorized, ` +
    `${radiantsRemoved} radiants removed, ${blockedArtifactsRemoved} artifacts blacklisted)`
  );
  console.info(
    `[TFT] Item categories: ` +
    Object.entries(categoryCounts).map(([k, v]) => `${k}=${v}`).join(", ")
  );

  return {
    setNumber: CURRENT_SET,
    setName: set17?.name ?? `Set ${CURRENT_SET}`,
    champions,
    traits,
    items,
  };
}
