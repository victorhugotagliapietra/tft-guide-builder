const CDRAGON_BASE = "https://raw.communitydragon.org/latest";
const CDRAGON_GAME = `${CDRAGON_BASE}/game`;

export const TFT_DATA_URL = `${CDRAGON_BASE}/cdragon/tft/en_us.json`;

/**
 * Convert a raw CommunityDragon asset path to a usable CDN URL.
 *
 * CDragon paths come in two forms:
 *   "ASSETS/Characters/TFT14_Jinx/..."   (most common in TFT JSON)
 *   "/lol-game-data/assets/ASSETS/..."   (older format seen in some records)
 *
 * The CDN stores files at:
 *   https://raw.communitydragon.org/latest/game/<lowercased-path>
 */
function cdnUrl(rawPath: string): string {
  if (!rawPath) return "";
  const cleaned = rawPath
    .replace(/^\/lol-game-data\/assets\//i, "")
    .replace(/^\//i, "");
  return `${CDRAGON_GAME}/${cleaned.toLowerCase()}`;
}

export function championIconUrl(squareIconPath: string): string {
  return cdnUrl(squareIconPath);
}

export function itemIconUrl(iconPath: string): string {
  return cdnUrl(iconPath);
}

export function traitIconUrl(iconPath: string): string {
  return cdnUrl(iconPath);
}
