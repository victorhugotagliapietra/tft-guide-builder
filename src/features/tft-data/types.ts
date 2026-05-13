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
  | "radiant"
  | "component";

export type TFTItem = {
  apiName: string;
  name: string;
  iconPath: string;
  iconUrl: string;
  category: TFTItemCategory;
  composition: string[];
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

export type TFTSetData = {
  setNumber: number;
  setName: string;
  champions: TFTChampion[];
  items: TFTItem[];
  traits: TFTTrait[];
};
