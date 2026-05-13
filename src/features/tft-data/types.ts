export type TFTChampion = {
  apiName: string;         // e.g. "TFT17_Jinx"
  characterName: string;
  name: string;            // display name, e.g. "Jinx"
  cost: number;            // 1–5; 0 for special units (Training Dummy)
  traits: string[];
  squareIconPath: string;  // raw path from CDragon JSON
  iconUrl: string;         // CDragon URL (lowercase, .tex→.png)
  fallbackIconUrl: string; // rerollcdn URL, used if CDragon returns 404
  plannerId?: number;
};

export type TFTItemCategory =
  | "normal"
  | "emblem"
  | "artifact"
  | "trait";

/** Loose role tag for sorting the Normal tab. Derived from item composition. */
export type ItemRole = "tank" | "support" | "flex" | "ap" | "fighter";

export type TFTItem = {
  apiName: string;
  name: string;
  iconPath: string;
  iconUrl: string;
  category: TFTItemCategory;
  composition: string[];
  /** Only set on `category === "normal"` items — used to sort the Normal grid. */
  role?: ItemRole;
  /** For emblem items: the trait apiName they grant. */
  associatedTrait?: string;
};

export type TraitBreakpoint = {
  minUnits: number;
  maxUnits?: number;
  tier: "bronze" | "silver" | "gold" | "prismatic";
};

export type TFTTrait = {
  apiName: string;
  name: string;
  iconPath: string;
  iconUrl: string;
  breakpoints: TraitBreakpoint[];
  hasEmblem: boolean;
};

// ---------------------------------------------------------------------------
// Augments
// ---------------------------------------------------------------------------

export type TFTAugmentTier = "silver" | "gold" | "prismatic";

export type TFTAugment = {
  /** Stable, URL-safe id derived from apiName (e.g. "augment_recombobulator"). */
  id: string;
  apiName: string;
  name: string;
  /** Display description with CDragon templated placeholders preserved. */
  description?: string;
  /** Full CDragon HTTP URL for the augment icon. */
  icon: string;
  tier: TFTAugmentTier;
  /** Trait apiNames this augment is locked to (CDragon `associatedTraits`). */
  traits?: string[];
  /** Champion apiNames this augment is tied to (rare — only when CDragon exposes it). */
  relatedChampions?: string[];
};

export type TFTSetData = {
  setNumber: number;
  setName: string;
  champions: TFTChampion[];
  items: TFTItem[];
  traits: TFTTrait[];
  augments: TFTAugment[];
};
