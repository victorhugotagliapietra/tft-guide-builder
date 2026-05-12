import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TFT_DATA_URL } from "./cdn";
import { normalizeSetData, type RawTFTData } from "./normalize";
import type { TFTSetData, TFTChampion } from "./types";
import { MOCK_CHAMPIONS } from "./mock-champions";

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
 * - `championMap` is a pre-built Map<apiName, TFTChampion> for O(1) lookup.
 */
export function useTFTData() {
  const query = useQuery<TFTSetData>({
    queryKey: ["tft-data"],
    queryFn: fetchTFTData,
    staleTime: 1000 * 60 * 60,       // 1 hour
    gcTime: 1000 * 60 * 60 * 24,     // 24 hours
    retry: 2,
  });

  const champions: TFTChampion[] = query.data?.champions ?? MOCK_CHAMPIONS;

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
