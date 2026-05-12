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
      if (!c.apiName || !c.name || c.cost < 1 || c.cost > 5) { skipped++; return false; }
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

  // Items — not set-specific
  const items = (tftRaw.items ?? [])
    .filter((i: any) => {
      if (!i.icon || !i.apiName || !i.name?.trim()) return false;
      const api: string = i.apiName;
      return !api.includes("_placeholder") && !api.includes("Tutorial") &&
             !api.includes("Debug") && !api.includes("Augment");
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

  console.log(`\nOutput written to ${OUT_DIR}`);
  console.log("  champions.json");
  console.log("  items.json");
  console.log("  traits.json");
  console.log("  planner-map.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
