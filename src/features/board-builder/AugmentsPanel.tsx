import { memo, useState, useEffect, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Search, X, Sparkles } from "lucide-react";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTAugment, TFTAugmentTier } from "@/features/tft-data/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tier order is preserved INTERNALLY (silver → gold → prismatic) so visual
// scanning still follows the natural progression — but tier headers, dividers,
// counts, and the panel title are intentionally not rendered. Tier identity is
// signaled by the tile's ring color alone.
// ---------------------------------------------------------------------------

const TIER_ORDER: TFTAugmentTier[] = ["silver", "gold", "prismatic"];

const TIER_TILE: Record<TFTAugmentTier, string> = {
  silver:    "ring-slate-400/50 hover:ring-slate-200/65",
  gold:      "ring-yellow-500/60 hover:ring-yellow-300/75 shadow-[0_0_5px_-3px_rgba(250,204,21,0.5)]",
  prismatic: "ring-fuchsia-400/60 hover:ring-fuchsia-300/80 shadow-[0_0_6px_-3px_rgba(232,121,249,0.55)]",
};

// Background fill + accent for the name placeholder when icon URLs all fail.
// Per-tier so the placeholder still reads as silver/gold/prismatic without an icon.
const TIER_PLACEHOLDER: Record<TFTAugmentTier, { bg: string; accent: string }> = {
  silver:    { bg: "bg-gradient-to-br from-slate-700/80 to-slate-800/80", accent: "text-slate-200/70" },
  gold:      { bg: "bg-gradient-to-br from-yellow-900/75 to-amber-950/85", accent: "text-yellow-300/70" },
  prismatic: { bg: "bg-gradient-to-br from-fuchsia-900/75 via-violet-900/75 to-cyan-900/75", accent: "text-fuchsia-200/70" },
};

// ---------------------------------------------------------------------------
// CDragon plugin base URL — used by path normalization to detect malformed
// inputs (double slashes, duplicated prefix, missing scheme, etc.).
// ---------------------------------------------------------------------------

const CDRAGON_PLUGIN_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/";

/**
 * Normalize a (possibly malformed) CDragon URL.
 *
 * Handles:
 *  - missing/duplicated plugin prefix
 *  - duplicated `https://...` in the middle of the path
 *  - double slashes inside the path component (preserves the `https://`)
 *  - trailing whitespace
 *  - mixed casing (CDragon's file server is case-sensitive lowercase)
 *
 * Returns "" if the input doesn't look like an asset path.
 */
function normalizeCdragonUrl(input: string): string {
  if (!input) return "";
  let url = input.trim();

  // Strip any accidentally-duplicated `https://...` in the middle.
  const lastScheme = url.lastIndexOf("https://");
  if (lastScheme > 0) url = url.slice(lastScheme);

  // If the input is a bare ASSETS/... path, prepend the plugin base.
  if (!/^https?:\/\//i.test(url)) {
    url = CDRAGON_PLUGIN_BASE + url.replace(/^\/+/, "");
  }

  // Collapse double slashes inside the path component without touching `https://`.
  const schemeMatch = url.match(/^(https?:\/\/)(.*)$/i);
  if (schemeMatch) {
    url = schemeMatch[1] + schemeMatch[2].replace(/\/{2,}/g, "/");
  }

  // Force-lowercase the entire URL — CDragon's CDN only serves lowercase files
  // for the plugin path and refuses mixed casing.
  url = url.toLowerCase();

  return url;
}

// ---------------------------------------------------------------------------
// Augment icon URL fallback chain
// ---------------------------------------------------------------------------
//
// CDragon advertises every augment's `.tex` path but doesn't always ship the
// converted `.png`. Rather than removing augments at build time, we try a
// sequence of URL variants at render time and fall through to a tier-tinted
// name placeholder only if every candidate fails. The augment stays in the
// catalog throughout.
//
// Generated variants (in priority order, deduped):
//   1. Primary URL (assetUrl(icon)) — as normalize.ts produced it
//   2. DDragon URL (augment.iconAlt) — Riot's CDN, populated by use-tft-data.ts
//      when DDragon's tft-augments.json has an entry for this apiName. This
//      recovers a meaningful chunk of augments whose CDragon .png is missing.
//   3. Path-normalized variant (handles malformed inputs)
//   4. Set-tag stripped (e.g. `_ii.tft_set17.png` → `_ii.png`)
//   5. Tier-suffix stripped (`spellsword_ii.png` → `spellsword.png`)
//   6. Set-tag AND tier stripped
//   7. Trailing single digit stripped (`snipersnest2.png` → `snipersnest.png`)
//   8. Hyphens ↔ underscores in the filename
//   9. Extension variants — `.png` → `.webp` / `.jpg` (some assets ship as webp)
//  10. apiName-derived path: assets/maps/tft/icons/augments/hexcore/<lowercased_api>.png
//
// All transforms are cheap; the de-dup Set ensures each unique URL is tried
// at most once. DDragon URLs are NOT pushed through normalizeCdragonUrl()
// (which is CDragon-specific) — they're added verbatim.
function buildAugmentIconCandidates(augment: TFTAugment): string[] {
  const primary = normalizeCdragonUrl(augment.icon);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url: string) => {
    const n = normalizeCdragonUrl(url);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  // DDragon URLs use a different host + casing convention from CDragon, so
  // they're added directly without the CDragon-specific normalizer.
  const pushDirect = (url: string | undefined) => {
    if (url && url.trim() && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  };

  push(primary);
  // DDragon fallback right after the primary — second-best chance to load
  // before we start trying generated regex variants.
  pushDirect(augment.iconAlt);

  if (!primary) return out;

  // Drop ".tft_setN..." / ".tft_N_M..." set-tag suffix in the filename.
  const noSetTag = primary.replace(/\.tft[_\-]?(set)?\d+(_\d+)?\.png$/i, ".png");
  push(noSetTag);

  // Drop a trailing tier suffix: `-i`, `-ii`, `-iii`, `_i`, `_ii`, `_iii`.
  const dropTier = (url: string) => url.replace(/[-_]i{1,3}\.png$/i, ".png");
  push(dropTier(primary));
  push(dropTier(noSetTag));

  // Drop a single trailing digit (e.g. `snipersnest2.png` → `snipersnest.png`).
  push(primary.replace(/\d\.png$/i, ".png"));
  push(noSetTag.replace(/\d\.png$/i, ".png"));

  // Swap hyphens/underscores in the filename portion only (keep the path).
  const swapSeparators = (url: string) => {
    const slash = url.lastIndexOf("/");
    if (slash < 0) return [];
    const path = url.slice(0, slash + 1);
    const file = url.slice(slash + 1);
    return [path + file.replace(/-/g, "_"), path + file.replace(/_/g, "-")];
  };
  for (const v of swapSeparators(primary)) push(v);
  for (const v of swapSeparators(noSetTag)) push(v);

  // Extension variants — try webp / jpg if the .png 404s.
  push(primary.replace(/\.png$/i, ".webp"));
  push(primary.replace(/\.png$/i, ".jpg"));

  // Last-ditch: apiName-derived path. CDragon doesn't actually expose this
  // pattern today, but if a future build does, we'll catch it for free.
  const apiNameLower = augment.apiName.replace(/^TFT(\d+)?_(Augment_)?/i, "").toLowerCase();
  if (apiNameLower) {
    push(`${CDRAGON_PLUGIN_BASE}assets/maps/tft/icons/augments/hexcore/${apiNameLower}.png`);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Session-level resolution cache.
//
// Keyed by augment apiName. Once we've determined an outcome for an augment —
// either a working URL or "all candidates failed" — we store it so subsequent
// renders skip the trial chain entirely. This prevents:
//   - re-attempting URLs we've already proven 404
//   - re-firing onError on every parent re-render
//   - flooding the console with the same warning every render
//   - infinite retry loops if a parent passes new callback identities
//
// The cache lives at module scope (per browser tab); browser-level disk/HTTP
// caching is unaffected.
// ---------------------------------------------------------------------------

type IconResolution = { ok: true; url: string } | { ok: false; attempted: string[] };
const iconResolutionCache = new Map<string, IconResolution>();

// ---------------------------------------------------------------------------
// Name placeholder — shown when every candidate URL has 404'd. Tier-tinted,
// fixed footprint (matches the icon size exactly), the augment name wrapped
// in two lines, and a small Sparkles glyph to keep the tile visually anchored.
// The augment is still draggable / assignable; only the visual differs.
// ---------------------------------------------------------------------------

function NamePlaceholder({
  augment,
  className,
}: {
  augment: TFTAugment;
  className?: string;
}) {
  const cfg = TIER_PLACEHOLDER[augment.tier];
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center text-center px-0.5 select-none",
        cfg.bg,
        className
      )}
      title={augment.name}
    >
      <Sparkles className={cn("w-2.5 h-2.5 absolute top-0.5 right-0.5 opacity-50", cfg.accent)} />
      <span className="text-[7px] font-medium leading-tight text-white/90 line-clamp-2">
        {augment.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AugmentIcon — multi-step fallback resolution, cached at module scope.
//
// Lifecycle:
//   1. Build the candidate URL list (cheap useMemo over icon path)
//   2. If module cache already has an outcome for this apiName: render that
//      directly (skip trial chain entirely)
//   3. Else step through candidates via onError. onLoad caches the working URL.
//   4. When candidates exhaust, a useEffect records the failure in the cache
//      and emits exactly one console.warn for this apiName per session.
//
// Why module-level cache: prevents re-trial when parent re-renders, prevents
// console spam from logging the same failure every render, and prevents any
// possibility of an infinite retry loop driven by changing prop identity.
// ---------------------------------------------------------------------------

export function AugmentIcon({
  augment,
  className,
}: {
  augment: TFTAugment;
  className?: string;
}) {
  const candidates = useMemo(() => buildAugmentIconCandidates(augment), [augment]);
  const [attemptIdx, setAttemptIdx] = useState(0);

  // Reset attempt counter if the underlying augment swaps in the same slot.
  useEffect(() => setAttemptIdx(0), [augment.apiName]);

  // Once we exhaust every candidate, record the failure + log once. Inside
  // a useEffect so the cache write + console.warn never happen during render.
  useEffect(() => {
    if (candidates.length === 0 || attemptIdx < candidates.length) return;
    if (iconResolutionCache.has(augment.apiName)) return;
    iconResolutionCache.set(augment.apiName, { ok: false, attempted: candidates });
    console.warn(
      `[TFT augment] icon unresolved — name="${augment.name}" ` +
      `apiName=${augment.apiName} tier=${augment.tier} ` +
      `attempted=[${candidates.join(" | ")}]`
    );
  }, [augment.apiName, augment.name, augment.tier, attemptIdx, candidates]);

  // Cache-first read on every render. Once an outcome is recorded for this
  // apiName we bypass the trial chain entirely.
  const cached = iconResolutionCache.get(augment.apiName);
  if (cached && cached.ok) {
    return (
      <img
        src={cached.url}
        alt={augment.name}
        className={cn("object-contain", className)}
        loading="lazy"
        draggable={false}
        // No onError on the cached-success path: if a URL worked once in this
        // session, we assume it keeps working. Avoids accidental invalidation
        // on transient network blips.
      />
    );
  }
  if (cached && !cached.ok) {
    return <NamePlaceholder augment={augment} className={className} />;
  }

  // Cache miss + candidates exhausted (or empty) → placeholder. The useEffect
  // above will record the failure on the next tick.
  if (candidates.length === 0 || attemptIdx >= candidates.length) {
    return <NamePlaceholder augment={augment} className={className} />;
  }

  // Cache miss + candidates remaining → render the current attempt.
  return (
    <img
      src={candidates[attemptIdx]}
      alt={augment.name}
      className={cn("object-contain", className)}
      loading="lazy"
      draggable={false}
      onLoad={() => {
        // First time this URL loads — pin it in the cache so we skip the
        // trial chain on future renders for this augment.
        if (!iconResolutionCache.has(augment.apiName)) {
          iconResolutionCache.set(augment.apiName, {
            ok: true,
            url: candidates[attemptIdx],
          });
        }
      }}
      onError={() => setAttemptIdx((i) => i + 1)}
    />
  );
}

// ---------------------------------------------------------------------------
// Draggable augment tile — icon ONLY (no name label). Drag ID: "augment:<api>"
// Footprint is fixed (no scale on hover) so the dense grid never reflows.
// ---------------------------------------------------------------------------

export function DraggableAugmentTile({ augment }: { augment: TFTAugment }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `augment:${augment.apiName}`,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      title={augment.name}
      className={cn(
        "w-10 h-10 rounded-md overflow-hidden ring-1 cursor-grab active:cursor-grabbing select-none transition-[box-shadow,filter] duration-150 hover:brightness-110",
        TIER_TILE[augment.tier],
        isDragging && "opacity-40"
      )}
    >
      <AugmentIcon augment={augment} className="w-full h-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag overlay preview — rendered inside <DragOverlay> by BoardStepCard.
// ---------------------------------------------------------------------------

export function AugmentDragOverlay({ augment }: { augment: TFTAugment }) {
  return (
    <div
      className={cn(
        "w-10 h-10 rounded-md overflow-hidden ring-2 shadow-2xl select-none pointer-events-none",
        TIER_TILE[augment.tier]
      )}
    >
      <AugmentIcon augment={augment} className="w-full h-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AugmentsPanel — pure icon grid. No section title, no tier headers, no
// dividers, no counts. Augments are never filtered out — even ones with
// broken icons render as a tier-tinted name placeholder so the catalog stays
// complete.
// ---------------------------------------------------------------------------

function AugmentsPanelImpl() {
  const { augmentsByTier } = useTFTData();
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Flatten by tier into a single ordered list — internal silver → gold →
  // prismatic order is preserved (signaled by ring color) but we render one
  // unified grid so there are no visible tier breaks.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const seen = new Set<string>();
    const out: TFTAugment[] = [];
    for (const tier of TIER_ORDER) {
      for (const a of augmentsByTier[tier]) {
        if (seen.has(a.apiName)) continue;
        if (q && !a.name.toLowerCase().includes(q)) continue;
        seen.add(a.apiName);
        out.push(a);
      }
    }
    return out;
  }, [augmentsByTier, search]);

  return (
    <div className="flex flex-col gap-1.5 min-h-0">
      {/* Minimal search — no surrounding label or panel title */}
      <div className="flex items-center justify-end">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            placeholder="Search augments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 pl-6 pr-6 text-xs w-44 bg-background/50"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => {
                setSearch("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Dense icon grid. Internal padding (p-1.5) keeps the first row/column
          off the container edge so tile rings + shadows aren't clipped against
          the scrollbar or the panel border. Fluid columns auto-fill the panel
          width with 40px tiles; gap-1.5 trades a hair of density for clearer
          per-tile separation. */}
      <div
        className={cn(
          "grid p-1.5 gap-1.5 overflow-y-auto justify-items-start",
          "scroll-smooth",
          "[&::-webkit-scrollbar]:w-1.5",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-white/10",
          "hover:[&::-webkit-scrollbar-thumb]:bg-white/25"
        )}
        style={{
          maxHeight: 420,
          scrollbarGutter: "stable",
          gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))",
        }}
      >
        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 py-6 text-center italic [grid-column:1/-1]">
            No augments found
          </p>
        ) : (
          visible.map((a) => <DraggableAugmentTile key={a.apiName} augment={a} />)
        )}
      </div>
    </div>
  );
}

export const AugmentsPanel = memo(AugmentsPanelImpl);

