import type { TFTChampion } from "./types";

/**
 * Static fallback champion list used when CommunityDragon data hasn't loaded yet
 * or fails to fetch. These are real TFT champion names but without live icon URLs.
 * The `iconUrl` is empty — UI components should skip rendering <img> when empty.
 */
export const MOCK_CHAMPIONS: TFTChampion[] = [
  // Cost 1
  { apiName: "TFT_Garen",     characterName: "TFT_Garen",     name: "Garen",       cost: 1, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Jinx",      characterName: "TFT_Jinx",      name: "Jinx",        cost: 1, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Nasus",     characterName: "TFT_Nasus",     name: "Nasus",       cost: 1, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Poppy",     characterName: "TFT_Poppy",     name: "Poppy",       cost: 1, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Wukong",    characterName: "TFT_Wukong",    name: "Wukong",      cost: 1, traits: [], squareIconPath: "", iconUrl: "" },
  // Cost 2
  { apiName: "TFT_Darius",    characterName: "TFT_Darius",    name: "Darius",      cost: 2, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Gangplank", characterName: "TFT_Gangplank", name: "Gangplank",   cost: 2, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Gnar",      characterName: "TFT_Gnar",      name: "Gnar",        cost: 2, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Lux",       characterName: "TFT_Lux",       name: "Lux",         cost: 2, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Pantheon",  characterName: "TFT_Pantheon",  name: "Pantheon",    cost: 2, traits: [], squareIconPath: "", iconUrl: "" },
  // Cost 3
  { apiName: "TFT_Ahri",      characterName: "TFT_Ahri",      name: "Ahri",        cost: 3, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Annie",     characterName: "TFT_Annie",     name: "Annie",       cost: 3, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Fiora",     characterName: "TFT_Fiora",     name: "Fiora",       cost: 3, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Jax",       characterName: "TFT_Jax",       name: "Jax",         cost: 3, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Morgana",   characterName: "TFT_Morgana",   name: "Morgana",     cost: 3, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Veigar",    characterName: "TFT_Veigar",    name: "Veigar",      cost: 3, traits: [], squareIconPath: "", iconUrl: "" },
  // Cost 4
  { apiName: "TFT_Draven",    characterName: "TFT_Draven",    name: "Draven",      cost: 4, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Ezreal",    characterName: "TFT_Ezreal",    name: "Ezreal",      cost: 4, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Leona",     characterName: "TFT_Leona",     name: "Leona",       cost: 4, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Lissandra", characterName: "TFT_Lissandra", name: "Lissandra",   cost: 4, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Orianna",   characterName: "TFT_Orianna",   name: "Orianna",     cost: 4, traits: [], squareIconPath: "", iconUrl: "" },
  // Cost 5
  { apiName: "TFT_AurelionSol", characterName: "TFT_AurelionSol", name: "Aurelion Sol", cost: 5, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_KogMaw",    characterName: "TFT_KogMaw",    name: "Kog'Maw",     cost: 5, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Ryze",      characterName: "TFT_Ryze",      name: "Ryze",        cost: 5, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Teemo",     characterName: "TFT_Teemo",     name: "Teemo",       cost: 5, traits: [], squareIconPath: "", iconUrl: "" },
  { apiName: "TFT_Volibear",  characterName: "TFT_Volibear",  name: "Volibear",    cost: 5, traits: [], squareIconPath: "", iconUrl: "" },
];

export const COST_COLORS: Record<number, { bg: string; text: string; ring: string }> = {
  1: { bg: "bg-slate-500",  text: "text-white",     ring: "ring-slate-400"  },
  2: { bg: "bg-green-700",  text: "text-white",     ring: "ring-green-500"  },
  3: { bg: "bg-blue-700",   text: "text-white",     ring: "ring-blue-500"   },
  4: { bg: "bg-purple-700", text: "text-white",     ring: "ring-purple-500" },
  5: { bg: "bg-yellow-500", text: "text-slate-900", ring: "ring-yellow-400" },
};
