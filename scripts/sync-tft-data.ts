/**
 * Fetch TFT Set 17 data from CommunityDragon and save static JSON files to
 * public/tft-data/ so the app can optionally serve them locally.
 *
 * Run with: bun scripts/sync-tft-data.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CDRAGON_BASE = "https://raw.communitydragon.org/latest";
const PLUGIN_BASE = `${CDRAGON_BASE}/plugins/rcp-be-lol-game-data/global/default`;
const TFT_DATA_URL = `${CDRAGON_BASE}/cdragon/tft/en_us.json`;
const TFT_TEAM_PLANNER_URL = `${PLUGIN_BASE}/v1/tftchampions-teamplanner.json`;

const CURRENT_SET = 17;
const OUT_DIR = join(import.meta.dirname, "..", "public", "tft-data");

function assetUrl(path: string): string {
  if (!path) return "";
  return `${PLUGIN_BASE}/${path.replace(/^\//, "")}`;
}

async function main() {
  console.log("Fetching TFT data from CommunityDragon...");

  const [tftRes, plannerRes] = await Promise.all([
    fetch(TFT_DATA_URL),
    fetch(TFT_TEAM_PLANNER_URL),
  ]);

  if (!tftRes.ok) throw new Error(`TFT data fetch failed: ${tftRes.status}`);
  if (!plannerRes.ok) throw new Error(`Planner data fetch failed: ${plannerRes.status}`);

  const tftRaw = await tftRes.json();
  const plannerRaw: Array<{ id: number; apiName: string; name: string }> = await plannerRes.json();

  const plannerMap = new Map(plannerRaw.map((p) => [p.apiName, p.id]));
  console.log(`Fetched ${plannerRaw.length} planner entries`);

  const sets: any[] = tftRaw.setData ?? [];

  // Find Set 17 explicitly
  const set17 = sets.find((s: any) => s.number === CURRENT_SET);
  if (!set17) {
    const available = sets.map((s: any) => s.number).join(", ");
    throw new Error(`Set ${CURRENT_SET} not found. Available: ${available}`);
  }
  console.log(`Found Set ${CURRENT_SET}: "${set17.name}"`);

  let skipped = 0;
  const champions = (set17.champions ?? [])
    .filter((c: any) => {
      if (!c.apiName || !c.name || c.cost < 1 || c.cost > 5) {
        skipped++;
        return false;
      }
      return true;
    })
    .map((c) => {
      const iconPath = c.squareIcon || c.squareIconPath || c.icon || c.tileIcon || "";
      if (!iconPath) console.warn(`  Missing icon: ${c.apiName}`);
      return {
        apiName: c.apiName,
        characterName: c.characterName ?? c.apiName,
        name: c.name,
        cost: c.cost,
        traits: c.traits ?? [],
        squareIconPath: iconPath,
        iconUrl: assetUrl(iconPath),
        plannerId: plannerMap.get(c.apiName),
      };
    });

  console.log(`Champions: ${champions.length} Set 17 included, ${skipped} skipped`);

  const missingIcons = champions.filter((c) => !c.iconUrl).length;
  if (missingIcons > 0) console.warn(`  ${missingIcons} champions missing icons`);

  const missingPlannerId = champions.filter((c) => c.plannerId === undefined).length;
  if (missingPlannerId > 0) {
    console.warn(`  ${missingPlannerId} champions have no planner ID`);
  }

  const traits = (set17?.traits ?? [])
    .filter((t: any) => t.icon && t.apiName && t.name)
    .map((t: any) => ({
      apiName: t.apiName,
      name: t.name,
      iconPath: t.icon,
      iconUrl: assetUrl(t.icon),
    }));
  console.log(`Traits: ${traits.length}`);

  // -------------------------------------------------------------------------
  // Augments — must be normalized BEFORE items so the items filter (which
  // blocks anything matching /augment/i in apiName) doesn't shadow them.
  // Mirrors normalize.ts logic so the standalone script stays self-contained.
  // -------------------------------------------------------------------------

  const AUGMENT_UNIVERSAL_RE = /^TFT_Augment_/i;
  const AUGMENT_CURRENT_SET_RE = new RegExp(`^TFT${CURRENT_SET}_Augment_`, "i");

  const AUGMENT_APINAME_BLOCKLIST: RegExp[] = [
    /HeroAugment/i,
    /Hero_Augment/i,
    /GodAugment/i,
    /_PAIRS$/i,
    /DoubleUpAugment/i,
    /TeamupAugment/i,
    /MarketOffering/i,
    /Tutorial/i,
    /TFTEvent/i,
    /_Debug/i,
    /_Test/i,
    /_Placeholder/i,
    /_PVE/i,
    /_Encounter/i,
    /Changeling_Glamour/i,
    /_SmallQuest$/i,
    /_MediumQuest$/i,
    /_LargeQuest$/i,
    /_SkipOption$/i,
    /_DummyPower$/i,
    /_PIckEms$/i,
    /_Set\d+$/i,
  ];

  const AUGMENT_ICON_BLOCKLIST: RegExp[] = [/unusable/i, /_placeholder/i];

  type AugmentTier = "silver" | "gold" | "prismatic";

  function pickAugIcon(raw: any): string {
    const candidates = [raw.iconPath, raw.icon, raw.AugmentSmall, raw.AugmentTile];
    for (const c of candidates) {
      if (typeof c === "string" && c.toLowerCase().includes("assets/")) return c;
    }
    return "";
  }

  function hasOldSetMarker(iconPath: string): boolean {
    const m = iconPath.match(/\.TFT_Set(\d+)[._]/i);
    if (!m) return false;
    return parseInt(m[1], 10) !== CURRENT_SET;
  }

  function detectTier(iconPath: string, apiName: string): AugmentTier {
    if (
      /_III[._]/.test(iconPath) ||
      /-III\.tex$/i.test(iconPath) ||
      /Missing-T3/i.test(iconPath) ||
      /Tier3/i.test(iconPath)
    )
      return "prismatic";
    if (
      /_II[._]/.test(iconPath) ||
      /-II\.tex$/i.test(iconPath) ||
      /Missing-T2/i.test(iconPath) ||
      /Tier2/i.test(iconPath)
    )
      return "gold";
    if (
      /_I[._]/.test(iconPath) ||
      /-I\.tex$/i.test(iconPath) ||
      /Missing-T1/i.test(iconPath) ||
      /Tier1/i.test(iconPath)
    )
      return "silver";
    const m = iconPath.match(/(\d)\.tex$/i);
    if (m) {
      if (m[1] === "3") return "prismatic";
      if (m[1] === "2") return "gold";
      if (m[1] === "1") return "silver";
    }
    if (/(PlusPlus|Prismatic)$/i.test(apiName)) return "prismatic";
    if (/Plus$/i.test(apiName)) return "gold";
    console.warn(`  [augment] tier unknown, defaulting silver: ${apiName}`);
    return "silver";
  }

  function makeId(apiName: string): string {
    return apiName
      .replace(new RegExp(`^TFT(_|${CURRENT_SET}_)`, "i"), "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase();
  }

  const augMap = new Map<string, any>();
  let augCandidates = 0;
  let augSkipped = 0;
  for (const raw of (tftRaw.items ?? []) as any[]) {
    const api = raw.apiName ?? "";
    const inSet = AUGMENT_UNIVERSAL_RE.test(api) || AUGMENT_CURRENT_SET_RE.test(api);
    if (!inSet) continue;
    augCandidates++;
    if (!raw.name?.trim() || raw.hidden) {
      augSkipped++;
      continue;
    }
    if (AUGMENT_APINAME_BLOCKLIST.some((re) => re.test(api))) {
      augSkipped++;
      continue;
    }
    const iconPath = pickAugIcon(raw);
    if (!iconPath || AUGMENT_ICON_BLOCKLIST.some((re) => re.test(iconPath))) {
      augSkipped++;
      continue;
    }
    if (hasOldSetMarker(iconPath)) {
      augSkipped++;
      continue;
    }
    const name = raw.name.trim();
    if (name.length < 2 || name.length > 80 || /^TFT[_\d]/i.test(name)) {
      augSkipped++;
      continue;
    }
    if (augMap.has(api)) continue;
    const tier = detectTier(iconPath, api);
    const associatedTraits = (raw.associatedTraits ?? []).filter(
      (t: any) => typeof t === "string" && t.length > 0,
    );
    const cleanedDesc = (raw.desc ?? "").trim();
    augMap.set(api, {
      id: makeId(api),
      apiName: api,
      name,
      ...(cleanedDesc.length > 0 ? { description: cleanedDesc } : {}),
      icon: assetUrl(iconPath),
      tier,
      ...(associatedTraits.length > 0 ? { traits: associatedTraits } : {}),
    });
  }

  const augments = [...augMap.values()].sort((a, b) => {
    const ord = { silver: 0, gold: 1, prismatic: 2 } as const;
    const t = ord[a.tier as AugmentTier] - ord[b.tier as AugmentTier];
    if (t !== 0) return t;
    return a.name.localeCompare(b.name);
  });

  const augByTier: Record<AugmentTier, any[]> = { silver: [], gold: [], prismatic: [] };
  for (const a of augments) augByTier[a.tier as AugmentTier].push(a);

  console.log(
    `Augments: ${augments.length} kept / ${augCandidates} candidates (${augSkipped} skipped)`,
  );
  console.log(
    `  silver=${augByTier.silver.length}, gold=${augByTier.gold.length}, prismatic=${augByTier.prismatic.length}`,
  );

  // Items — not set-specific
  const items = (tftRaw.items ?? [])
    .filter((i: any) => {
      if (!i.icon || !i.apiName || !i.name?.trim()) return false;
      const api: string = i.apiName;
      return (
        !api.includes("_placeholder") &&
        !api.includes("Tutorial") &&
        !api.includes("Debug") &&
        !api.includes("Augment")
      );
    })
    .map((i: any) => {
      const isEmblem =
        i.isEmblem === true ||
        i.apiName.toLowerCase().includes("emblem") ||
        (i.associatedTraits?.length ?? 0) > 0;
      const isComponent = !isEmblem && (i.composition?.length ?? 0) === 0;
      return {
        apiName: i.apiName,
        name: i.name,
        iconPath: i.icon,
        iconUrl: assetUrl(i.icon),
        isComponent,
        isEmblem,
        composition: i.composition ?? [],
      };
    });
  console.log(`Items: ${items.length}`);

  // Planner ID map
  const plannerIdMap: Record<string, number> = {};
  for (const c of champions) {
    if (c.plannerId !== undefined) plannerIdMap[c.apiName] = c.plannerId;
  }

  // Write output
  mkdirSync(OUT_DIR, { recursive: true });

  writeFileSync(join(OUT_DIR, "champions.json"), JSON.stringify(champions, null, 2));
  writeFileSync(join(OUT_DIR, "items.json"), JSON.stringify(items, null, 2));
  writeFileSync(join(OUT_DIR, "traits.json"), JSON.stringify(traits, null, 2));
  writeFileSync(join(OUT_DIR, "planner-map.json"), JSON.stringify(plannerIdMap, null, 2));
  writeFileSync(join(OUT_DIR, "augments.json"), JSON.stringify(augments, null, 2));
  writeFileSync(join(OUT_DIR, "augments-by-tier.json"), JSON.stringify(augByTier, null, 2));

  console.log(`\nOutput written to ${OUT_DIR}`);
  console.log("  champions.json");
  console.log("  items.json");
  console.log("  traits.json");
  console.log("  planner-map.json");
  console.log("  augments.json");
  console.log("  augments-by-tier.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
