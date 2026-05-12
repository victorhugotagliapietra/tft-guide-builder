import type { TFTChampion } from "./types";

/**
 * Static fallback list used when CDragon hasn't loaded yet.
 * Contains a small representative Set 17 roster — no real icon URLs.
 */
export const MOCK_CHAMPIONS: TFTChampion[] = [
  // Cost 1
  { apiName: "TFT17_Briar",       characterName: "TFT17_Briar",       name: "Briar",       cost: 1, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Briar.png" },
  { apiName: "TFT17_Jinx",        characterName: "TFT17_Jinx",        name: "Jinx",        cost: 1, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Jinx.png" },
  { apiName: "TFT17_Nasus",       characterName: "TFT17_Nasus",       name: "Nasus",       cost: 1, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Nasus.png" },
  // Cost 2
  { apiName: "TFT17_Belveth",     characterName: "TFT17_Belveth",     name: "Bel'Veth",    cost: 2, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Bel'Veth.png" },
  { apiName: "TFT17_Gnar",        characterName: "TFT17_Gnar",        name: "Gnar",        cost: 2, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Gnar.png" },
  // Cost 3
  { apiName: "TFT17_Ahri",        characterName: "TFT17_Ahri",        name: "Ahri",        cost: 3, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Ahri.png" },
  { apiName: "TFT17_MissFortune", characterName: "TFT17_MissFortune", name: "Miss Fortune", cost: 3, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Miss%20Fortune.png" },
  // Cost 4
  { apiName: "TFT17_Aatrox",      characterName: "TFT17_Aatrox",      name: "Aatrox",      cost: 4, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Aatrox.png" },
  { apiName: "TFT17_Ezreal",      characterName: "TFT17_Ezreal",      name: "Ezreal",      cost: 4, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Ezreal.png" },
  // Cost 5
  { apiName: "TFT17_AurelionSol", characterName: "TFT17_AurelionSol", name: "Aurelion Sol", cost: 5, traits: [], squareIconPath: "", iconUrl: "", fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Aurelion%20Sol.png" },
];

export const COST_COLORS: Record<number, { bg: string; text: string; ring: string }> = {
  0: { bg: "bg-zinc-700",   text: "text-zinc-300",  ring: "ring-zinc-500"   },
  1: { bg: "bg-slate-500",  text: "text-white",     ring: "ring-slate-400"  },
  2: { bg: "bg-green-700",  text: "text-white",     ring: "ring-green-500"  },
  3: { bg: "bg-blue-700",   text: "text-white",     ring: "ring-blue-500"   },
  4: { bg: "bg-purple-700", text: "text-white",     ring: "ring-purple-500" },
  5: { bg: "bg-yellow-500", text: "text-slate-900", ring: "ring-yellow-400" },
};
