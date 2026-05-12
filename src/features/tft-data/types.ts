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

export type TFTItem = {
  apiName: string;
  name: string;
  iconPath: string;
  iconUrl: string;
  isComponent: boolean;
  isEmblem: boolean;
  composition: string[];
};

export type TFTTrait = {
  apiName: string;
  name: string;
  iconPath: string;
  iconUrl: string;
};

export type TFTSetData = {
  setNumber: number;
  setName: string;
  champions: TFTChampion[];
  items: TFTItem[];
  traits: TFTTrait[];
};
