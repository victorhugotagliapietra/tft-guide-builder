import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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

// ---------------------------------------------------------------------------
// Augment icon — purely an <img> with an onError callback. The runtime broken-
// icon set lives in the parent so a failed image can be removed from the grid
// in the same render tick (filter excludes it on the next pass).
// ---------------------------------------------------------------------------

function AugmentIcon({
  augment,
  className,
  onImageError,
}: {
  augment: TFTAugment;
  className?: string;
  onImageError?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [augment.icon]);

  if (!augment.icon || failed) {
    // Visible fallback — but the parent will also remove this augment from
    // its filtered list on the next render via the onImageError callback,
    // so this state is short-lived (one paint at most).
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/40 text-[7px] text-muted-foreground text-center leading-tight px-0.5",
          className
        )}
      >
        {augment.name.slice(0, 5)}
      </div>
    );
  }
  return (
    <img
      src={augment.icon}
      alt={augment.name}
      className={cn("object-contain", className)}
      loading="lazy"
      draggable={false}
      onError={() => {
        setFailed(true);
        onImageError?.();
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Draggable augment tile — icon ONLY (no name label). Drag ID: "augment:<api>"
// Footprint is fixed (no scale on hover) so the dense grid never reflows.
// ---------------------------------------------------------------------------

export function DraggableAugmentTile({
  augment,
  onImageError,
}: {
  augment: TFTAugment;
  onImageError?: () => void;
}) {
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
      <AugmentIcon augment={augment} className="w-full h-full" onImageError={onImageError} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag overlay preview — rendered inside <DragOverlay> by BoardStepCard.
// Uses the same tile dimensions so the overlay tracks the cursor cleanly.
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
// dividers, no counts. Only the search field and the grid itself.
// ---------------------------------------------------------------------------

export function AugmentsPanel() {
  const { augmentsByTier } = useTFTData();
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Runtime broken-icon Set. normalize.ts curates a static blocklist of
  // known-404 icons, but anything CDragon adds in the future that 404s will
  // be caught here on first paint and removed from subsequent renders.
  const [brokenIcons, setBrokenIcons] = useState<Set<string>>(() => new Set());
  const markBroken = useCallback((apiName: string) => {
    setBrokenIcons((prev) => {
      if (prev.has(apiName)) return prev;
      const next = new Set(prev);
      next.add(apiName);
      console.debug(`[TFT] Runtime: hiding augment with broken icon: ${apiName}`);
      return next;
    });
  }, []);

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
        if (brokenIcons.has(a.apiName)) continue;
        if (q && !a.name.toLowerCase().includes(q)) continue;
        seen.add(a.apiName);
        out.push(a);
      }
    }
    return out;
  }, [augmentsByTier, search, brokenIcons]);

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

      {/* Dense icon grid — fluid columns auto-fill the available width with
          40px tiles + 4px gaps. Tier sequence is encoded in the source order;
          the ring color on each tile signals its tier without needing a header. */}
      <div
        className={cn(
          "grid gap-1 overflow-y-auto pr-1 min-h-[120px] justify-items-start",
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
          visible.map((a) => (
            <DraggableAugmentTile
              key={a.apiName}
              augment={a}
              onImageError={() => markBroken(a.apiName)}
            />
          ))
        )}
      </div>
    </div>
  );
}
