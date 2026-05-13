import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TFT_DATA_URL } from "./cdn";
import { normalizeSetData, type RawTFTData } from "./normalize";
import type { TFTSetData, TFTChampion, TFTTrait, TFTAugment } from "./types";
import { MOCK_CHAMPIONS } from "./mock-champions";

// Training dummies always available at cost 0 (excluded from normal filters)
const DUMMY_UNITS: TFTChampion[] = [
  {
    apiName: "TFT_TrainingDummy",
    characterName: "TFT_TrainingDummy",
    name: "Training Dummy",
    cost: 0,
    traits: [],
    squareIconPath: "ASSETS/Characters/TFT_TrainingDummy/HUD/Icons2D/TFT_TrainingDummy_Square.png",
    iconUrl:
      "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/tft_trainingdummy/hud/icons2d/tft_trainingdummy_square.png",
    fallbackIconUrl: "https://rerollcdn.com/characters/Skin/17/Training%20Dummy.png",
  },
];

async function fetchTFTData(): Promise<TFTSetData> {
  const res = await fetch(TFT_DATA_URL);
  if (!res.ok) throw new Error(`CDragon fetch failed: ${res.status}`);
  const raw: RawTFTData = await res.json();
  return normalizeSetData(raw);
}

/**
 * Fetches and normalizes TFT Set 17 data from CommunityDragon.
 *
 * - champions: Set 17 playable roster (cost 1–5) + Training Dummy appended last
 * - championMap: O(1) lookup by apiName
 * - Falls back to MOCK_CHAMPIONS when data is loading or errored
 */
export function useTFTData() {
  const query = useQuery<TFTSetData>({
    queryKey: ["tft-data"],
    queryFn: fetchTFTData,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
  });

  const baseChampions: TFTChampion[] = query.data?.champions ?? MOCK_CHAMPIONS;

  // Combine real roster with synthetic dummy units, deduped by apiName.
  // Dedup defends against any future path where a dummy might end up in
  // baseChampions (CDragon staging entries, mock overlap, etc.) — without
  // this guard, a single source change could produce duplicate dummies that
  // re-appear every time the search input is cleared.
  const champions: TFTChampion[] = useMemo(() => {
    const seen = new Set<string>();
    const out: TFTChampion[] = [];
    for (const c of [...baseChampions, ...DUMMY_UNITS]) {
      if (seen.has(c.apiName)) {
        console.debug(`[TFT] Skipping duplicate champion apiName: ${c.apiName}`);
        continue;
      }
      seen.add(c.apiName);
      out.push(c);
    }
    return out;
  }, [baseChampions]);

  const championMap = useMemo(
    () => new Map(champions.map((c) => [c.apiName, c])),
    [champions]
  );

  const traits: TFTTrait[] = query.data?.traits ?? [];

  const traitMap = useMemo(
    () => new Map(traits.map((t) => [t.apiName, t])),
    [traits]
  );

  const augments: TFTAugment[] = query.data?.augments ?? [];

  // O(1) lookup by apiName — the augment system identifies entries by apiName,
  // not by display name, so all UI/dnd-kit code keys off this.
  const augmentMap = useMemo(
    () => new Map(augments.map((a) => [a.apiName, a])),
    [augments]
  );

  // Pre-bucketed by tier — TraitsPanel / AugmentsPanel will render these in
  // three columns without recomputing every render.
  const augmentsByTier = useMemo(() => {
    const out = { silver: [] as TFTAugment[], gold: [] as TFTAugment[], prismatic: [] as TFTAugment[] };
    for (const a of augments) out[a.tier].push(a);
    return out;
  }, [augments]);

  return {
    ...query,
    champions,
    championMap,
    items: query.data?.items ?? [],
    traits,
    traitMap,
    augments,
    augmentMap,
    augmentsByTier,
    setNumber: query.data?.setNumber ?? 17,
    setName: query.data?.setName ?? "",
    isUsingMockData: !query.data,
  };
}
