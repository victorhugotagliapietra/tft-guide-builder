import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TFT_DATA_URL } from "./cdn";
import { normalizeSetData, type RawTFTData } from "./normalize";
import type { TFTSetData, TFTChampion, TFTTrait, TFTAugment } from "./types";
import { MOCK_CHAMPIONS } from "./mock-champions";

// CDragon's team-planner manifest. The TFT in-game team-planner code uses
// each champion's 1-indexed position in the ALPHABETICALLY-SORTED list of
// `character_id` values for the current set (NOT the `team_planner_code`
// field, which turns out to be a different per-set integer ID we don't need).
// Reference: https://gist.github.com/xrr2016/22fa6e92278a2481f9026f6456b0afa4
const TFT_TEAM_PLANNER_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/tftchampions-teamplanner.json";

type TeamPlannerEntry = { character_id?: string; team_planner_code?: number };
type TeamPlannerJson = Record<string, TeamPlannerEntry[]>;

/**
 * Fetch CDragon's team-planner manifest and build an apiName → planner-byte
 * map for the current set. The planner byte is the champion's 1-indexed
 * position in the alphabetically-sorted `character_id` list — the exact
 * encoding scheme the TFT client expects in v01 team-planner codes.
 *
 * Sort is over the FULL set's entries (including NPC / "Apex" units like
 * `TFT17_Enemy_Aatrox`) because Riot's own encoder uses the canonical
 * team-planner JSON ordering. Filtering at the export stage (see
 * planner-code.ts) handles helper / training units appropriately.
 *
 * Non-fatal: if the fetch fails the map is empty and the encoder surfaces
 * an explicit "data not loaded" error instead of producing a broken code.
 */
async function fetchTeamPlannerMap(setNumber: number): Promise<Record<string, number>> {
  try {
    const res = await fetch(TFT_TEAM_PLANNER_URL);
    if (!res.ok) {
      console.warn(`[TFT] Team-planner fetch failed: ${res.status}`);
      return {};
    }
    const json = (await res.json()) as TeamPlannerJson;
    const key = `TFTSet${setNumber}`;
    const entries = json[key];
    if (!Array.isArray(entries)) {
      console.warn(`[TFT] Team-planner: no ${key} entries found`);
      return {};
    }

    // 1-indexed alphabetic sort. Keep all valid character_id entries — the
    // TFT client's encoder sorts the entire set, not a filtered subset.
    const characterIds = entries
      .map((e) => e.character_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .sort();

    const out: Record<string, number> = {};
    for (let i = 0; i < characterIds.length; i++) {
      // 1-indexed per the team-planner code spec; index 0 (byte 0x00) is
      // the empty-slot sentinel.
      out[characterIds[i]] = i + 1;
    }

    console.info(
      `[TFT] Team-planner alphabetic index: ${characterIds.length} entries for ${key} ` +
      `(${characterIds[0]}=1 … ${characterIds[characterIds.length - 1]}=${characterIds.length})`
    );
    return out;
  } catch (err) {
    console.warn(`[TFT] Team-planner fetch threw:`, err);
    return {};
  }
}

// Training dummies always available at cost 0 (excluded from normal filters).
//
// The Training Dummy uses a LOCAL static asset committed to `public/tft-data/`.
// This is intentional — the CDragon path (ChampionSplashes/...) isn't served
// at runtime, and external mirrors can change or 404 unexpectedly. Pointing at
// our own asset guarantees the image renders identically across champion list,
// board hexes, and drag overlay with zero network variability.
//
// `TRAINING_DUMMY_API_NAME` is exported so render code can short-circuit the
// generic ChampionImg fallback chain and load the local asset directly,
// bypassing CDragon and rerollcdn lookups entirely for this one unit.
export const TRAINING_DUMMY_API_NAME = "TFT_TrainingDummy";
export const TRAINING_DUMMY_LOCAL_ICON = "/tft-data/TFT_TrainingDummy.webp";

const DUMMY_UNITS: TFTChampion[] = [
  {
    apiName: TRAINING_DUMMY_API_NAME,
    characterName: TRAINING_DUMMY_API_NAME,
    name: "Training Dummy",
    cost: 0,
    traits: [],
    squareIconPath: TRAINING_DUMMY_LOCAL_ICON,
    iconUrl: TRAINING_DUMMY_LOCAL_ICON,
    // Empty fallbackIconUrl — render code special-cases this apiName so the
    // ChampionImg fallback chain never runs for the dummy. The string is kept
    // empty (not the local URL again) so any bug that bypasses the special
    // case fails loud (broken-image) instead of silently double-loading.
    fallbackIconUrl: "",
  },
];

// DDragon TFT augment manifest — provides an alternate image URL for augments
// whose CDragon .png is missing. Pinned to a known-stable patch so the URL
// never disappears (Riot keeps old DDragon patches live indefinitely). Bump
// when verifying a newer patch exposes additional augments.
const DDRAGON_PATCH = "14.20.1";
const DDRAGON_TFT_AUGMENTS_URL =
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_PATCH}/data/en_US/tft-augments.json`;
const DDRAGON_TFT_AUGMENT_IMG_BASE =
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_PATCH}/img/tft-augment/`;

type DDragonAugment = { id: string; image?: { full?: string } };
type DDragonAugmentsJson = { data?: Record<string, DDragonAugment> };

/**
 * Fetch DDragon's TFT augment manifest and build an apiName → image-URL map.
 * Non-fatal: if DDragon is unavailable or returns an unexpected shape, the
 * map is returned empty and CDragon-only resolution continues to work.
 */
async function fetchDDragonAugmentMap(): Promise<Record<string, string>> {
  try {
    const res = await fetch(DDRAGON_TFT_AUGMENTS_URL);
    if (!res.ok) {
      console.warn(`[TFT] DDragon augments fetch failed: ${res.status}`);
      return {};
    }
    const json = (await res.json()) as DDragonAugmentsJson;
    const out: Record<string, string> = {};
    for (const [apiName, entry] of Object.entries(json.data ?? {})) {
      const fname = entry.image?.full;
      if (fname && typeof fname === "string") {
        out[apiName] = DDRAGON_TFT_AUGMENT_IMG_BASE + fname;
      }
    }
    console.info(
      `[TFT] DDragon augment map: ${Object.keys(out).length} entries from patch ${DDRAGON_PATCH}`
    );
    return out;
  } catch (err) {
    console.warn(`[TFT] DDragon augments fetch threw:`, err);
    return {};
  }
}

// Pinned to the current set we render — must match normalize.ts CURRENT_SET.
const CURRENT_SET = 17;

async function fetchTFTData(): Promise<TFTSetData> {
  // Run CDragon (required), DDragon augment manifest (best-effort fallback),
  // and team-planner manifest (required for valid planner codes) in parallel.
  const [cdragonRes, ddragonMap, teamPlannerMap] = await Promise.all([
    fetch(TFT_DATA_URL),
    fetchDDragonAugmentMap(),
    fetchTeamPlannerMap(CURRENT_SET),
  ]);
  if (!cdragonRes.ok) throw new Error(`CDragon fetch failed: ${cdragonRes.status}`);
  const raw: RawTFTData = await cdragonRes.json();
  return normalizeSetData(raw, {
    ddragonAugments: ddragonMap,
    teamPlannerCodes: teamPlannerMap,
  });
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

  // Champion-apiName → team-planner byte code map. Built from the runtime
  // team-planner fetch (attached as `plannerId` on each champion during
  // normalization). Used by planner-code.ts to emit valid Riot codes; empty
  // map means the export will report an explicit error rather than emit a
  // broken code.
  const plannerCodeMap = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of champions) {
      if (typeof c.plannerId === "number") out.set(c.apiName, c.plannerId);
    }
    return out;
  }, [champions]);

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
    plannerCodeMap,
    items: query.data?.items ?? [],
    traits,
    traitMap,
    augments,
    augmentMap,
    augmentsByTier,
    setNumber: query.data?.setNumber ?? CURRENT_SET,
    setName: query.data?.setName ?? "",
    isUsingMockData: !query.data,
  };
}
