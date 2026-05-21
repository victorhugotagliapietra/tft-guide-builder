import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TFT_DATA_URL } from "./cdn";
import { normalizeSetData, type RawTFTData } from "./normalize";
import type { TFTSetData, TFTChampion, TFTTrait, TFTAugment, TFTItem } from "./types";
import { MOCK_CHAMPIONS } from "./mock-champions";

// CDragon's team-planner manifest. The TFT in-game team-planner code uses
// each champion's `team_planner_code` value DIRECTLY (as a 12-bit hex value
// per slot, NOT an alphabetic-index or other-derived ID). Reverse-engineered
// against a known-good Riot export sample provided by the user; see
// docs/PLANNER_CODE_CONTEXT.md for the full format spec.
const TFT_TEAM_PLANNER_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/tftchampions-teamplanner.json";

type TeamPlannerEntry = { character_id?: string; team_planner_code?: number };
type TeamPlannerJson = Record<string, TeamPlannerEntry[]>;

/**
 * Fetch CDragon's team-planner manifest and build an apiName → team-planner
 * code map for the current set. The encoder uses this map to produce real
 * Riot-compatible planner exports (see planner-code.ts).
 *
 * Non-fatal: if the fetch fails the map is empty and the encoder surfaces an
 * explicit "data not loaded" error instead of producing a broken code.
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
    const out: Record<string, number> = {};
    for (const e of entries) {
      if (typeof e.character_id === "string" && typeof e.team_planner_code === "number") {
        out[e.character_id] = e.team_planner_code;
      }
    }
    console.info(`[TFT] Team-planner map: ${Object.keys(out).length} entries for ${key}`);
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
const DDRAGON_TFT_AUGMENTS_URL = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_PATCH}/data/en_US/tft-augments.json`;
const DDRAGON_TFT_AUGMENT_IMG_BASE = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_PATCH}/img/tft-augment/`;

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
      `[TFT] DDragon augment map: ${Object.keys(out).length} entries from patch ${DDRAGON_PATCH}`,
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

// ---------------------------------------------------------------------------
// Context-backed shape of all the maps/lists every consumer needs.
//
// Building these maps is cheap individually but happens dozens of times per
// render across the editor (every BoardStepCard, every AugmentSlot, every
// TraitsPanel etc. used to call useTFTData() and recompute its own copy).
// Centralizing it in a single Provider means each Map is built ONCE per data
// load — children just read it via context.
// ---------------------------------------------------------------------------

export type TFTDataContextValue = {
  champions: TFTChampion[];
  championMap: Map<string, TFTChampion>;
  items: TFTItem[];
  itemMap: Map<string, TFTItem>;
  traits: TFTTrait[];
  traitMap: Map<string, TFTTrait>;
  augments: TFTAugment[];
  augmentMap: Map<string, TFTAugment>;
  augmentsByTier: { silver: TFTAugment[]; gold: TFTAugment[]; prismatic: TFTAugment[] };
  plannerCodeMap: Map<string, number>;
  setNumber: number;
  setName: string;
  isUsingMockData: boolean;
  isLoading: boolean;
  isError: boolean;
};

const TFTDataContext = createContext<TFTDataContextValue | null>(null);

/**
 * Provider that fetches CDragon/DDragon data once and exposes pre-computed
 * Maps via context. Mount this once near the root of the tree (see
 * routes/__root.tsx). All child components MUST use `useTFTData()` to read —
 * no component should call useQuery(['tft-data']) directly.
 */
export function TFTDataProvider({ children }: { children: ReactNode }) {
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
  // baseChampions (CDragon staging entries, mock overlap, etc.).
  const champions: TFTChampion[] = useMemo(() => {
    const seen = new Set<string>();
    const out: TFTChampion[] = [];
    for (const c of [...baseChampions, ...DUMMY_UNITS]) {
      if (seen.has(c.apiName)) continue;
      seen.add(c.apiName);
      out.push(c);
    }
    return out;
  }, [baseChampions]);

  const championMap = useMemo(() => new Map(champions.map((c) => [c.apiName, c])), [champions]);

  const plannerCodeMap = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of champions) {
      if (typeof c.plannerId === "number") out.set(c.apiName, c.plannerId);
    }
    return out;
  }, [champions]);

  const traits: TFTTrait[] = query.data?.traits ?? [];
  const traitMap = useMemo(() => new Map(traits.map((t) => [t.apiName, t])), [traits]);

  const items: TFTItem[] = query.data?.items ?? [];
  const itemMap = useMemo(() => new Map(items.map((i) => [i.apiName, i])), [items]);

  const augments: TFTAugment[] = query.data?.augments ?? [];
  const augmentMap = useMemo(() => new Map(augments.map((a) => [a.apiName, a])), [augments]);

  const augmentsByTier = useMemo(() => {
    const out = {
      silver: [] as TFTAugment[],
      gold: [] as TFTAugment[],
      prismatic: [] as TFTAugment[],
    };
    for (const a of augments) out[a.tier].push(a);
    return out;
  }, [augments]);

  const value = useMemo<TFTDataContextValue>(
    () => ({
      champions,
      championMap,
      items,
      itemMap,
      traits,
      traitMap,
      augments,
      augmentMap,
      augmentsByTier,
      plannerCodeMap,
      setNumber: query.data?.setNumber ?? CURRENT_SET,
      setName: query.data?.setName ?? "",
      isUsingMockData: !query.data,
      isLoading: query.isLoading,
      isError: query.isError,
    }),
    [
      champions,
      championMap,
      items,
      itemMap,
      traits,
      traitMap,
      augments,
      augmentMap,
      augmentsByTier,
      plannerCodeMap,
      query.data,
      query.isLoading,
      query.isError,
    ],
  );

  return <TFTDataContext.Provider value={value}>{children}</TFTDataContext.Provider>;
}

/**
 * Read TFT data + pre-computed lookup Maps. MUST be used inside a
 * <TFTDataProvider> (mounted at the route root). Throws otherwise — silent
 * fallback would mask the perf regression of duplicated Map construction.
 */
export function useTFTData(): TFTDataContextValue {
  const ctx = useContext(TFTDataContext);
  if (!ctx) {
    throw new Error("useTFTData must be used inside a <TFTDataProvider>");
  }
  return ctx;
}
