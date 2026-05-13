import type {
  TFTChampion,
  TFTItem,
  TFTItemCategory,
  TFTTrait,
  TFTSetData,
  TraitBreakpoint,
  ItemRole,
  TFTAugment,
  TFTAugmentTier,
} from "./types";
import { championIconUrl, itemIconUrl, traitIconUrl, rerollCdnChampionUrl, assetUrl } from "./cdn";

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
  // Description (used by augments — CDragon-templated text with @placeholder@ tokens).
  desc?: string;
  // Alternate icon fields the augment fallback chain checks.
  iconPath?: string;
  AugmentSmall?: string;
  AugmentTile?: string;
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

// Non-playable champion names that CDragon sometimes includes in set data with
// cost 1-5 (e.g. Blue Golem, Rift Scuttler). Lowercased for case-insensitive match.
const CHAMPION_NAME_BLOCKLIST = new Set([
  "golem",
  "blue golem",
  "blue sentinel",
  "rift scuttler",
  "scuttler",
]);
// Additional apiName pattern guard in case display names change between patches.
const CHAMPION_API_BLOCKLIST = [/golem/i, /riftscuttler/i, /scuttler/i];

// ---------------------------------------------------------------------------
// Per-item icon URL overrides for assets CDragon doesn't actually serve.
// Keep this list short and document each entry — every override is technical
// debt against a missing upstream file.
// ---------------------------------------------------------------------------

const ITEM_ICON_URL_OVERRIDES: Record<string, string> = {
  // Horizon Focus: CDragon lists the icon at
  //   ASSETS/Maps/TFT/Icons/Items/Hexcore/TFT_Item_Artifact_HorizonFocus.TFT_Set13.tex
  // but the converted .png is not present on the CDN (404). Fall back to
  // DDragon's authoritative LoL item icon (id 4628) — pinned to a stable
  // DDragon version since DDragon keeps old patch URLs live indefinitely.
  TFT_Item_Artifact_HorizonFocus:
    "https://ddragon.leagueoflegends.com/cdn/14.20.1/img/item/4628.png",
};

function getBestIconPath(c: RawChampion): string {
  // CDragon tft/en_us.json uses "squareIcon" for the portrait-sized image.
  // Fall back to "icon" (splash art) or "tileIcon" if unavailable.
  return c.squareIcon || c.squareIconPath || c.icon || c.tileIcon || "";
}

// ---------------------------------------------------------------------------
// Augment normalization
// ---------------------------------------------------------------------------
//
// Augments live in `raw.items` alongside regular items but follow a different
// apiName scheme and have no `composition`/`isEmblem` flags. The Set 17 augment
// pool is the union of:
//
//   - TFT_Augment_*       (universal pool reused across sets)
//   - TFT17_Augment_*     (set-specific augments)
//
// We exclude old-set leftovers, modes (Double Up / Team Up), tutorial / debug /
// PVE markers, set-locked Changeling/glamour items, and Set 17 "God Augments"
// (champion-specific ascension rewards — not part of the standard 4-augment
// slot pool). Tier is inferred from Roman-numeral markers in the icon path,
// with several fallback patterns for inconsistent CDragon naming.

const AUGMENT_UNIVERSAL_RE = /^TFT_Augment_/i;
const AUGMENT_CURRENT_SET_RE = new RegExp(`^TFT${CURRENT_SET}_Augment_`, "i");

// apiName patterns that mark an augment as out of scope for the standard pool.
const AUGMENT_APINAME_BLOCKLIST: RegExp[] = [
  /HeroAugment/i,            // Set 9 hero-augment remnants
  /Hero_Augment/i,
  /GodAugment/i,             // Set 17 God Augments (ascension rewards, not slot picks)
  /_PAIRS$/i,                // Double Up pair suffix
  /DoubleUpAugment/i,        // Double Up exclusive
  /TeamupAugment/i,          // team-up encounter only
  /MarketOffering/i,         // Set 17 market UI rolls
  /Tutorial/i,               // tutorial augments
  /TFTEvent/i,               // event-only augments
  /_Debug/i,
  /_Test/i,
  /_Placeholder/i,
  /_PVE/i,                   // PVE encounter exclusive
  /_Encounter/i,             // encounter-only augments
  /Changeling_Glamour/i,     // Set 15 changeling glamour leftovers
  /_SmallQuest$/i,           // quest progression markers
  /_MediumQuest$/i,
  /_LargeQuest$/i,
  /_SkipOption$/i,           // UI skip placeholders
  /_DummyPower$/i,
  /_PIckEms$/i,              // CDragon-side typo for an internal marker
  /_Set\d+$/i,               // legacy "_Set7", "_Set12" suffixed reroll leftovers
];

const AUGMENT_ICON_BLOCKLIST: RegExp[] = [
  /unusable/i,
  /_placeholder/i,
  // CDragon ships several `Missing-T1/T2/T3` placeholder icons for augments
  // that don't have authored art yet. The .png never resolves, so the augment
  // would render as a broken image. Reject these outright — the loss is small
  // (~6 augments at most) and the catalog stays clean.
  /Missing-T[123]\.tex$/i,
  // ChoiceUI/ADMIN_Armorery_Icon: CDragon's "Augment menu admin" placeholder.
  /ADMIN_Armorery_Icon/i,
];

// ---------------------------------------------------------------------------
// Augment apiName blocklist — known-broken icons that we've validated via
// HEAD-probe against CDragon. These augments pass every pattern filter but
// their .png genuinely 404s at runtime (CDragon ships the .tex path but never
// the converted PNG). Removing them at normalize-time produces a clean catalog
// with zero broken-image tiles in the UI.
//
// Audited 2026-05-13 against:
//   https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/
// Regenerate via the HEAD-probe script if/when CDragon adds the missing assets.
// ---------------------------------------------------------------------------

const BROKEN_AUGMENT_APINAMES = new Set<string>([
  "TFT_Augment_AvengeTheFallen",
  "TFT_Augment_AxiomArc3",
  "TFT_Augment_Backup",
  "TFT_Augment_BlossomingLotus1",
  "TFT_Augment_BlossomingLotus2",
  "TFT_Augment_BRB",
  "TFT_Augment_CloseQuarters",
  "TFT_Augment_CustomFitted",
  "TFT_Augment_DawnbringersBlessing1",
  "TFT_Augment_DawnbringersBlessing2",
  "TFT_Augment_DefenseCall",
  "TFT_Augment_EndlessConflagration",
  "TFT_Augment_FinalPolish",
  "TFT_Augment_FinalResistance",
  "TFT_Augment_FutureSight2",
  "TFT_Augment_Mentorship1",
  "TFT_Augment_Mentorship2",
  "TFT_Augment_MoneyHungryPlus",
  "TFT_Augment_PiercingLotus1",
  "TFT_Augment_PiercingLotus2",
  "TFT_Augment_Pirates3",
  "TFT_Augment_ShareTheSpotlight",
  "TFT_Augment_Spellsword",
  "TFT_Augment_StockMarket",
  "TFT_Augment_SupportMining",
  "TFT_Augment_SupportMiningPlus",
  "TFT_Augment_SupportSentinel",
  "TFT_Augment_SupportSentinel2",
  "TFT_Augment_TheFloorIsLava",
  "TFT_Augment_VerticallyInclined",
  "TFT_Augment_Voidborne",
  "TFT_Augment_VoidborneHR",
  "TFT_Augment_WealthyRehab1",
  "TFT_Augment_WealthyRehab2",
  "TFT17_Augment_EmergencySupplies",
  "TFT17_Augment_ShepherdAugment",
  "TFT17_Augment_ShieldTank_DivinePaladins",
  "TFT17_Augment_SnipersNest",
  "TFT17_Augment_Weightlifting",
]);

function isAugmentInCurrentSet(apiName: string): boolean {
  return AUGMENT_UNIVERSAL_RE.test(apiName) || AUGMENT_CURRENT_SET_RE.test(apiName);
}

/**
 * Detect old-set markers in the icon path. The path occasionally embeds a
 * ".TFT_Set{N}." suffix indicating which set the icon was authored for —
 * anything other than the current set is treated as an old-set leftover.
 */
function hasOldSetAugmentIconMarker(iconPath: string): boolean {
  const m = iconPath.match(/\.TFT_Set(\d+)[._]/i);
  if (!m) return false;
  return parseInt(m[1], 10) !== CURRENT_SET;
}

function isUsableAugment(raw: RawItem): boolean {
  if (!raw.apiName || !raw.name?.trim()) return false;
  if (raw.hidden) return false;
  if (!isAugmentInCurrentSet(raw.apiName)) return false;
  if (AUGMENT_APINAME_BLOCKLIST.some((re) => re.test(raw.apiName))) return false;

  // The icon path is required for tier detection. We accept augments even
  // when only fallback fields are populated, so resolve the icon first.
  const iconCandidate = pickAugmentIconPath(raw);
  if (!iconCandidate) return false;
  if (AUGMENT_ICON_BLOCKLIST.some((re) => re.test(iconCandidate))) return false;
  if (hasOldSetAugmentIconMarker(iconCandidate)) return false;

  // Sanity-check the display name
  const name = raw.name.trim();
  if (name.length < 2 || name.length > 80) return false;
  if (/^TFT[_\d]/i.test(name)) return false;
  return true;
}

/**
 * Resolve the best icon path from the augment's available fields.
 *
 * Priority:
 *   1. iconPath  (newer CDragon shape, when present)
 *   2. icon      (standard field used by most TFT items/augments)
 *   3. AugmentSmall / AugmentTile (rare alternate fields the user spec mentions)
 */
function pickAugmentIconPath(raw: RawItem): string {
  const candidates = [raw.iconPath, raw.icon, raw.AugmentSmall, raw.AugmentTile];
  for (const c of candidates) {
    if (typeof c === "string" && c.toLowerCase().includes("assets/")) return c;
  }
  return "";
}

/**
 * Map an icon path to one of the three augment tiers.
 *
 * Detection order (each stops as soon as it matches):
 *   1. Explicit Roman-numeral suffix on the icon filename: `_I.`, `_II.`, `_III.`
 *   2. Dash-separated Roman numerals: `-I.tex`, `-II.tex`, `-III.tex`
 *   3. CDragon placeholder names: `Missing-T1`, `Missing-T2`, `Missing-T3`
 *   4. Numeric tier markers: `Tier1`, `Tier2`, `Tier3`
 *   5. Trailing digit before extension: `Foo2.tex` → gold, `Foo3.tex` → prismatic
 *   6. apiName Plus/PlusPlus suffix conventions
 *   7. Final fallback: silver (logged so we can audit unknowns)
 */
function detectAugmentTier(iconPath: string, apiName: string): TFTAugmentTier {
  if (/_III[._]/.test(iconPath) || /-III\.tex$/i.test(iconPath) || /Missing-T3/i.test(iconPath) || /Tier3/i.test(iconPath)) {
    return "prismatic";
  }
  if (/_II[._]/.test(iconPath) || /-II\.tex$/i.test(iconPath) || /Missing-T2/i.test(iconPath) || /Tier2/i.test(iconPath)) {
    return "gold";
  }
  if (/_I[._]/.test(iconPath) || /-I\.tex$/i.test(iconPath) || /Missing-T1/i.test(iconPath) || /Tier1/i.test(iconPath)) {
    return "silver";
  }

  // Trailing digit before .tex (e.g., SnipersNest2.tex)
  const m = iconPath.match(/(\d)\.tex$/i);
  if (m) {
    if (m[1] === "3") return "prismatic";
    if (m[1] === "2") return "gold";
    if (m[1] === "1") return "silver";
  }

  // apiName fallback patterns
  if (/(PlusPlus|Prismatic)$/i.test(apiName)) return "prismatic";
  if (/Plus$/i.test(apiName)) return "gold";

  console.warn(`[TFT] Augment tier unknown, defaulting to silver: ${apiName} (icon: ${iconPath})`);
  return "silver";
}

function makeAugmentId(apiName: string): string {
  // Stable URL-safe id derived from apiName: strip "TFT_" / "TFT17_" prefix,
  // lowercase, and keep only alphanumerics + underscore.
  return apiName
    .replace(new RegExp(`^TFT(_|${CURRENT_SET}_)`, "i"), "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

function normalizeAugment(raw: RawItem): TFTAugment | null {
  if (!isUsableAugment(raw)) return null;

  const iconPath = pickAugmentIconPath(raw);
  if (!iconPath) {
    console.warn(`[TFT] Augment skipped — no valid icon: ${raw.apiName}`);
    return null;
  }

  const iconUrl = assetUrl(iconPath);
  if (!iconUrl) {
    console.warn(`[TFT] Augment skipped — broken icon URL: ${raw.apiName}`);
    return null;
  }

  const tier = detectAugmentTier(iconPath, raw.apiName);
  const associatedTraits = (raw.associatedTraits ?? []).filter((t) => t && t.length > 0);
  const cleanedDesc = (raw.desc ?? "").trim();

  return {
    id: makeAugmentId(raw.apiName),
    apiName: raw.apiName,
    name: raw.name.trim(),
    ...(cleanedDesc.length > 0 ? { description: cleanedDesc } : {}),
    icon: iconUrl,
    tier,
    ...(associatedTraits.length > 0 ? { traits: associatedTraits } : {}),
  };
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
      if (!c.apiName || !c.name || c.cost < 1 || c.cost > 5) {
        skipped++;
        return false;
      }
      // Exclude non-playable NPCs (Golem, Rift Scuttler) that CDragon sometimes
      // includes in set data with a valid cost value.
      const nameLower = c.name.toLowerCase();
      const apiLower = c.apiName.toLowerCase();
      if (
        CHAMPION_NAME_BLOCKLIST.has(nameLower) ||
        CHAMPION_API_BLOCKLIST.some((p) => p.test(apiLower))
      ) {
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
    // Apply per-item icon URL override (currently only Horizon Focus — CDragon
    // ships the path but not the served .png). Falls through to the standard
    // assetUrl conversion when no override exists.
    const iconUrl = ITEM_ICON_URL_OVERRIDES[i.apiName] ?? itemIconUrl(i.icon);
    items.push({
      apiName: i.apiName,
      name: i.name,
      iconPath: i.icon,
      iconUrl,
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

  // -------------------------------------------------------------------------
  // Augments — separate pass over raw.items. Augments share the items array
  // in CDragon but are filtered out from `items` above via the "augment" entry
  // in ITEM_API_BLOCKLIST, so we re-scan rawItems here. Dedupe by apiName.
  // -------------------------------------------------------------------------

  const augmentMap = new Map<string, TFTAugment>();
  let augmentCandidates = 0;
  let augmentDuplicates = 0;
  let augmentSkippedBlocked = 0;
  let augmentSkippedOldSet = 0;
  let augmentSkippedMissingIcon = 0;
  let augmentSkippedBlockedIcon = 0;
  let augmentSkippedBrokenIcon = 0;

  for (const raw of rawItems) {
    if (!isAugmentInCurrentSet(raw.apiName)) continue;
    augmentCandidates++;

    // Inline the skip-reason categorization here so we can produce a meaningful
    // summary. normalizeAugment() also enforces these rules — we duplicate the
    // checks (cheap regex tests) so the counters reflect the actual reason
    // each candidate was dropped, not "skipped somewhere downstream".
    if (BROKEN_AUGMENT_APINAMES.has(raw.apiName)) {
      // Curated list of augments whose CDragon icon path resolves to a 404.
      // Dropping them at normalize-time guarantees the UI never renders a
      // broken-image tile or a placeholder card.
      augmentSkippedBrokenIcon++;
      console.debug(`[TFT] Augment with broken CDragon icon dropped: ${raw.apiName}`);
      continue;
    }
    if (AUGMENT_APINAME_BLOCKLIST.some((re) => re.test(raw.apiName))) {
      augmentSkippedBlocked++;
      continue;
    }
    const iconPath = pickAugmentIconPath(raw);
    if (!iconPath) {
      augmentSkippedMissingIcon++;
      console.debug(`[TFT] Augment missing icon, skipped: ${raw.apiName}`);
      continue;
    }
    if (AUGMENT_ICON_BLOCKLIST.some((re) => re.test(iconPath))) {
      augmentSkippedBlockedIcon++;
      continue;
    }
    if (hasOldSetAugmentIconMarker(iconPath)) {
      augmentSkippedOldSet++;
      console.debug(`[TFT] Old-set augment dropped: ${raw.apiName} (${iconPath})`);
      continue;
    }

    const aug = normalizeAugment(raw);
    if (!aug) {
      // Anything left here is a sanity-check failure inside normalizeAugment
      // (name length / shape). Already rare, but count it under blocked.
      augmentSkippedBlocked++;
      continue;
    }
    if (augmentMap.has(aug.apiName)) {
      augmentDuplicates++;
      console.debug(`[TFT] Duplicate augment apiName skipped: ${aug.apiName}`);
      continue;
    }
    augmentMap.set(aug.apiName, aug);
  }

  const augments: TFTAugment[] = [...augmentMap.values()].sort((a, b) => {
    // Sort by tier (silver → gold → prismatic) then alphabetically
    const tierOrder = { silver: 0, gold: 1, prismatic: 2 } as const;
    const t = tierOrder[a.tier] - tierOrder[b.tier];
    if (t !== 0) return t;
    return a.name.localeCompare(b.name);
  });

  const augmentTierCounts = augments.reduce(
    (acc, a) => { acc[a.tier] = (acc[a.tier] ?? 0) + 1; return acc; },
    {} as Record<TFTAugmentTier, number>
  );

  console.info(
    `[TFT] Augments: ${augments.length} kept / ${augmentCandidates} candidates ` +
    `(blocked=${augmentSkippedBlocked}, oldSet=${augmentSkippedOldSet}, ` +
    `missingIcon=${augmentSkippedMissingIcon}, blockedIcon=${augmentSkippedBlockedIcon}, ` +
    `brokenIcon=${augmentSkippedBrokenIcon}, duplicates=${augmentDuplicates})`
  );
  console.info(
    `[TFT] Augment tiers: ` +
    Object.entries(augmentTierCounts).map(([k, v]) => `${k}=${v}`).join(", ")
  );

  return {
    setNumber: CURRENT_SET,
    setName: set17?.name ?? `Set ${CURRENT_SET}`,
    champions,
    traits,
    items,
    augments,
  };
}
