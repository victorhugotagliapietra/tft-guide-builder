const CDRAGON_BASE = "https://raw.communitydragon.org/latest";
const PLUGIN_BASE = `${CDRAGON_BASE}/plugins/rcp-be-lol-game-data/global/default`;

export const TFT_DATA_URL = `${CDRAGON_BASE}/cdragon/tft/en_us.json`;

/**
 * Convert a raw asset path from the TFT JSON to a CDragon HTTP URL.
 *
 * CDragon serves files at:
 *   https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/<path>
 *
 * Rules:
 *  - Strip leading "/" if present
 *  - Lowercase the entire path (CDragon file server is case-sensitive and stores lowercase)
 *  - Replace .tex extension with .png (CDragon converts texture files to PNG for HTTP)
 */
export function assetUrl(path: string): string {
  if (!path) return "";
  const cleaned = path
    .replace(/^\//, "")
    .toLowerCase()
    .replace(/\.tex$/i, ".png");
  return `${PLUGIN_BASE}/${cleaned}`;
}

/**
 * Reroll CDN fallback URL for TFT champion portraits.
 * Used when the CDragon URL returns a 404 or fails to load.
 */
export function rerollCdnChampionUrl(championName: string): string {
  return `https://rerollcdn.com/characters/Skin/17/${encodeURIComponent(championName)}.png`;
}

export function championIconUrl(squareIconPath: string): string {
  return assetUrl(squareIconPath);
}

export function itemIconUrl(iconPath: string): string {
  return assetUrl(iconPath);
}

export function traitIconUrl(iconPath: string): string {
  return assetUrl(iconPath);
}
