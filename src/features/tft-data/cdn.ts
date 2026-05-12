const CDRAGON_BASE = "https://raw.communitydragon.org/latest";

export const TFT_DATA_URL = `${CDRAGON_BASE}/cdragon/tft/en_us.json`;

const PLUGIN_BASE = `${CDRAGON_BASE}/plugins/rcp-be-lol-game-data/global/default`;

export const TFT_TEAM_PLANNER_URL = `${PLUGIN_BASE}/v1/tftchampions-teamplanner.json`;

/**
 * Convert a raw CommunityDragon asset path to a usable CDN URL.
 * Strips the leading "/" if present; does NOT lowercase (paths are case-sensitive on this CDN).
 */
export function assetUrl(path: string): string {
  if (!path) return "";
  return `${PLUGIN_BASE}/${path.replace(/^\//, "")}`;
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
