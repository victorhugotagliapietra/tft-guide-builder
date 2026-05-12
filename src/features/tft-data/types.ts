export type TFTChampion = {
  apiName: string;        // e.g. "TFT17_Jinx" — key used in board_steps JSON
  characterName: string;  // game character record name (sometimes differs from apiName)
  name: string;           // display name, e.g. "Jinx"
  cost: number;           // 1–5
  traits: string[];       // trait apiNames for this champion
  squareIconPath: string; // raw path from CommunityDragon, e.g. "lol-game-data/assets/ASSETS/..."
  iconUrl: string;        // resolved CDN URL, ready to use in <img src>
  plannerId?: number;     // numeric ID used by TFT Team Planner
};

export type TFTItem = {
  apiName: string;
  name: string;
  iconPath: string;       // raw path from CommunityDragon
  iconUrl: string;        // resolved CDN URL
  isComponent: boolean;   // true = base component (B.F. Sword, Tear, etc.)
  isEmblem: boolean;
  composition: string[];  // apiNames of the two component items (empty if component)
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
