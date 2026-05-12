import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TFT_DATA_URL } from "./cdn";
import { normalizeSetData, type RawTFTData } from "./normalize";
import type { TFTSetData, TFTChampion } from "./types";
import { MOCK_CHAMPIONS } from "./mock-champions";

// Training dummies are always available regardless of CDragon load state
const DUMMY_UNITS: TFTChampion[] = [
  {
    apiName: "TFT_TrainingDummy",
    characterName: "TFT_TrainingDummy",
    name: "Training Dummy",
    cost: 0,
    traits: [],
    squareIconPath: "",
    iconUrl: "",
  },
  {
    apiName: "TFT_PracticeDummy",
    characterName: "TFT_PracticeDummy",
    name: "Practice Dummy",
    cost: 0,
    traits: [],
    squareIconPath: "",
    iconUrl: "",
  },
];

async function fetchTFTData(): Promise<TFTSetData> {
  const res = await fetch(TFT_DATA_URL);
  if (!res.ok) throw new Error(`CDragon fetch failed: ${res.status}`);
  const raw: RawTFTData = await res.json();
  return normalizeSetData(raw);
}

/**
 * Fetches and normalizes TFT champion / item / trait data from CommunityDragon.
 *
 * - Data is cached for 1 hour (staleTime) and kept in memory for 24 hours.
 * - When data is unavailable (loading or error), `champions` falls back to
 *   the static mock list so the builder is never completely empty.
 * - Training dummies are always appended at the end of the champion list.
 * - `championMap` is a pre-built Map<apiName, TFTChampion> for O(1) lookup.
 */
export function useTFTData() {
  const query = useQuery<TFTSetData>({
    queryKey: ["tft-data"],
    queryFn: fetchTFTData,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
  });

  const baseChampions: TFTChampion[] =
    query.data?.champions ?? MOCK_CHAMPIONS;

  // Dummies always come last regardless of live-data state
  const champions: TFTChampion[] = useMemo(
    () => [...baseChampions, ...DUMMY_UNITS],
    [baseChampions]
  );

  const championMap = useMemo(
    () => new Map(champions.map((c) => [c.apiName, c])),
    [champions]
  );

  return {
    ...query,
    champions,
    championMap,
    items: query.data?.items ?? [],
    traits: query.data?.traits ?? [],
    setNumber: query.data?.setNumber ?? 0,
    setName: query.data?.setName ?? "",
    isUsingMockData: !query.data,
  };
}
