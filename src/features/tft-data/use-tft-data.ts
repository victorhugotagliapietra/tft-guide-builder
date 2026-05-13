import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TFT_DATA_URL } from "./cdn";
import { normalizeSetData, type RawTFTData } from "./normalize";
import type { TFTSetData, TFTChampion, TFTTrait } from "./types";
import { MOCK_CHAMPIONS } from "./mock-champions";

// Training dummies always available at cost 0 (excluded from normal filters)
const DUMMY_UNITS: TFTChampion[] = [
  {
    apiName: "TFT_TrainingDummy",
    characterName: "TFT_TrainingDummy",
    name: "Training Dummy",
    cost: 0,
    traits: [],
    squareIconPath: "",
    iconUrl: "",
    fallbackIconUrl: "",
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

  const champions: TFTChampion[] = useMemo(
    () => [...baseChampions, ...DUMMY_UNITS],
    [baseChampions]
  );

  const championMap = useMemo(
    () => new Map(champions.map((c) => [c.apiName, c])),
    [champions]
  );

  const traits: TFTTrait[] = query.data?.traits ?? [];

  const traitMap = useMemo(
    () => new Map(traits.map((t) => [t.apiName, t])),
    [traits]
  );

  return {
    ...query,
    champions,
    championMap,
    items: query.data?.items ?? [],
    traits,
    traitMap,
    setNumber: query.data?.setNumber ?? 17,
    setName: query.data?.setName ?? "",
    isUsingMockData: !query.data,
  };
}
