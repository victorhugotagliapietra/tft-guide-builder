import { useState, useEffect, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Search, X } from "lucide-react";
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

// Background fill for the name placeholder when icon URLs all fail — tinted
// per tier so the tile still reads as silver/gold/prismatic without an icon.
const TIER_PLACEHOLDER_BG: Record<TFTAugmentTier, string> = {
  silver:    "bg-slate-700/60",
  gold:      "bg-yellow-900/55",
  prismatic: "bg-gradient-to-br from-fuchsia-900/55 to-cyan-900/55",
};

// ---------------------------------------------------------------------------
// Augment icon URL fallback chain
// ---------------------------------------------------------------------------
//
// CDragon advertises every augment's `.tex` path but doesn't always ship the
// converted `.png`. Rather than pre-filtering augments at build time (which
// over-aggressively deleted valid Set 17 entries), we try a sequence of URL
// variants at render time and fall through to a clean name placeholder only
// if every candidate fails. The augment stays in the catalog throughout.
//
// Generated variants (in priority order):
//   1. Primary URL (assetUrl(icon)) — as normalize.ts produced it
//   2. Set-tag stripped (e.g. `_II.tft_set17.png` → `_II.png`)
//   3. Tier-suffix stripped (`spellsword_ii.png` → `spellsword.png`)
//   4. Both stripped
//   5. Single trailing digit stripped (`snipersnest2.png` → `snipersnest.png`)
//   6. Hyphens ↔ underscores in the filename
//
// All of these are cheap regex transforms; we de-dup the resulting list so
// each unique URL is tried at most once.
function buildAugmentIconCandidates(primary: string): string[] {
  if (!primary) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  };

  push(primary);

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
    if (slash < 0) return url;
    const path = url.slice(0, slash + 1);
    const file = url.slice(slash + 1);
    return [
      path + file.replace(/-/g, "_"),
      path + file.replace(/_/g, "-"),
    ];
  };
  for (const v of swapSeparators(primary)) push(v);

  return out;
}

// ---------------------------------------------------------------------------
// Augment icon with a multi-URL fallback chain.
// onAllFailed fires once when every candidate URL has 404'd — useful in
// AugmentSlotsPanel etc. where we want to know if the assigned augment can't
// render an image (it still renders, just with the name placeholder).
// ---------------------------------------------------------------------------

export function AugmentIcon({
  augment,
  className,
  onAllFailed,
}: {
  augment: TFTAugment;
  className?: string;
  onAllFailed?: () => void;
}) {
  const candidates = useMemo(() => buildAugmentIconCandidates(augment.icon), [augment.icon]);
  const [attemptIdx, setAttemptIdx] = useState(0);

  // Reset attempt counter when the augment changes (component reuse case).
  useEffect(() => setAttemptIdx(0), [augment.icon]);

  // Notify parent once we've truly exhausted the fallback chain.
  useEffect(() => {
    if (attemptIdx >= candidates.length && candidates.length > 0) {
      onAllFailed?.();
    }
  }, [attemptIdx, candidates.length, onAllFailed]);

  if (candidates.length === 0 || attemptIdx >= candidates.length) {
    // Name placeholder — same footprint as the icon, tier-tinted background,
    // truncated name so the tile is still recognizable & drag-targetable.
    return (
      <div
        className={cn(
          "flex items-center justify-center text-[7px] font-medium text-white/85 text-center leading-tight px-0.5",
          TIER_PLACEHOLDER_BG[augment.tier],
          className
        )}
        title={augment.name}
      >
        <span className="line-clamp-2">{augment.name}</span>
      </div>
    );
  }

  return (
    <img
      src={candidates[attemptIdx]}
      alt={augment.name}
      className={cn("object-contain", className)}
      loading="lazy"
      draggable={false}
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
// broken icons render as a name placeholder so the catalog stays complete.
// ---------------------------------------------------------------------------

export function AugmentsPanel() {
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
