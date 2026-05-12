import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TFT_DATA_URL, TFT_TEAM_PLANNER_URL } from "./cdn";
import { normalizeSetData, enrichWithPlannerData, type RawTFTData, type RawPlannerData } from "./normalize";
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

async function fetchPlannerData(): Promise<RawPlannerData> {
  const res = await fetch(TFT_TEAM_PLANNER_URL);
  if (!res.ok) throw new Error(`Planner fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Fetches and normalizes TFT Set 17 champion / item / trait data from CommunityDragon.
 *
 * - Data is cached for 1 hour (staleTime) and kept in memory for 24 hours.
 * - When data is unavailable (loading or error), `champions` falls back to
 *   the static mock list so the builder is never completely empty.
 * - Training dummies are always appended at the end of the champion list.
 * - `championMap` is a pre-built Map<apiName, TFTChampion> for O(1) lookup.
 */
export function useTFTData() {
  const tftQuery = useQuery<TFTSetData>({
    queryKey: ["tft-data"],
    queryFn: fetchTFTData,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
  });

  const plannerQuery = useQuery<RawPlannerData>({
    queryKey: ["tft-planner-data"],
    queryFn: fetchPlannerData,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
  });

  const baseChampions: TFTChampion[] = useMemo(() => {
    const raw = tftQuery.data?.champions ?? MOCK_CHAMPIONS;
    if (tftQuery.data && plannerQuery.data) {
      return enrichWithPlannerData(raw, plannerQuery.data);
    }
    return raw;
  }, [tftQuery.data, plannerQuery.data]);

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
    ...tftQuery,
    champions,
    championMap,
    items: tftQuery.data?.items ?? [],
    traits: tftQuery.data?.traits ?? [],
    setNumber: tftQuery.data?.setNumber ?? 17,
    setName: tftQuery.data?.setName ?? "",
    isUsingMockData: !tftQuery.data,
  };
}
