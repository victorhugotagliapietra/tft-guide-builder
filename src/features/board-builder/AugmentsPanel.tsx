import { useState, useEffect, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Search, X } from "lucide-react";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTAugment, TFTAugmentTier } from "@/features/tft-data/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tier visual mapping — TFT-styled bands. Matches the in-game pick-screen
// palette (silver = cool gray, gold = warm yellow, prismatic = fuchsia/violet)
// without copying the exact game gradients. Border accents are subtle so the
// tier bands group visually without competing with the augment icons.
// ---------------------------------------------------------------------------

const TIER_ORDER: TFTAugmentTier[] = ["silver", "gold", "prismatic"];

const TIER_HEADER: Record<TFTAugmentTier, { label: string; text: string; line: string }> = {
  silver: { label: "Silver",    text: "text-slate-200",    line: "from-slate-500/60" },
  gold: {   label: "Gold",      text: "text-yellow-300",   line: "from-yellow-500/60" },
  prismatic:{label: "Prismatic",text: "text-fuchsia-200",  line: "from-fuchsia-400/60" },
};

const TIER_TILE: Record<TFTAugmentTier, string> = {
  silver:    "ring-slate-400/40 hover:ring-slate-200/60",
  gold:      "ring-yellow-500/50 hover:ring-yellow-300/70 shadow-[0_0_6px_-3px_rgba(250,204,21,0.5)]",
  prismatic: "ring-fuchsia-400/55 hover:ring-fuchsia-300/75 shadow-[0_0_8px_-3px_rgba(232,121,249,0.6)]",
};

// ---------------------------------------------------------------------------
// Augment icon with one-shot fallback
// ---------------------------------------------------------------------------

function AugmentIcon({ augment, className }: { augment: TFTAugment; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [augment.icon]);

  if (!augment.icon || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/40 text-[8px] text-muted-foreground text-center leading-tight px-0.5",
          className
        )}
      >
        {augment.name.slice(0, 6)}
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
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Draggable augment tile — drag ID format: "augment:<apiName>"
// Compact card: icon + truncated name beneath. Stable footprint (no scale).
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
        "group flex flex-col items-center gap-1 select-none cursor-grab active:cursor-grabbing transition-[opacity,filter] duration-150",
        isDragging && "opacity-40"
      )}
    >
      <div
        className={cn(
          "w-11 h-11 rounded-md overflow-hidden ring-1 transition-[box-shadow] duration-150",
          TIER_TILE[augment.tier]
        )}
      >
        <AugmentIcon augment={augment} className="w-full h-full" />
      </div>
      <span className="text-[9px] leading-none text-center text-foreground/80 group-hover:text-foreground truncate w-14">
        {augment.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag overlay preview — rendered inside <DragOverlay> by BoardStepCard
// ---------------------------------------------------------------------------

export function AugmentDragOverlay({ augment }: { augment: TFTAugment }) {
  return (
    <div className="flex flex-col items-center gap-1 select-none pointer-events-none">
      <div
        className={cn(
          "w-11 h-11 rounded-md overflow-hidden ring-2 shadow-2xl",
          TIER_TILE[augment.tier]
        )}
      >
        <AugmentIcon augment={augment} className="w-full h-full" />
      </div>
      <span className="text-[9px] leading-none text-center text-foreground">
        {augment.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier section header — a small label with a tier-tinted underline.
// ---------------------------------------------------------------------------

function TierHeader({ tier, count }: { tier: TFTAugmentTier; count: number }) {
  const cfg = TIER_HEADER[tier];
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className={cn("text-[10px] font-semibold tracking-wider uppercase", cfg.text)}>
        {cfg.label}
      </span>
      <div className={cn("flex-1 h-px bg-gradient-to-r to-transparent", cfg.line)} />
      <span className="text-[9px] text-muted-foreground/70 tabular-nums">{count}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AugmentsPanel
// ---------------------------------------------------------------------------

export function AugmentsPanel() {
  const { augmentsByTier } = useTFTData();
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Apply search filter without disturbing the per-tier ordering coming from
  // normalize.ts (silver → gold → prismatic, alpha within tier). We dedupe
  // defensively by apiName even though normalize.ts already does — the augment
  // pool is large and a duplicate would visually fragment the section.
  const filtered: Record<TFTAugmentTier, TFTAugment[]> = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: Record<TFTAugmentTier, TFTAugment[]> = { silver: [], gold: [], prismatic: [] };
    const seen = new Set<string>();
    for (const tier of TIER_ORDER) {
      for (const a of augmentsByTier[tier]) {
        if (seen.has(a.apiName)) continue;
        seen.add(a.apiName);
        if (q && !a.name.toLowerCase().includes(q)) continue;
        out[tier].push(a);
      }
    }
    return out;
  }, [augmentsByTier, search]);

  const totalShown = filtered.silver.length + filtered.gold.length + filtered.prismatic.length;

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
          Augments
        </span>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 pl-6 pr-6 text-xs w-32 bg-background/50"
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

      {/* Scrollable tier-grouped grid */}
      <div
        className={cn(
          "flex flex-col gap-1.5 overflow-y-auto pr-1 min-h-[120px]",
          "[&::-webkit-scrollbar]:w-1.5",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-white/10",
          "hover:[&::-webkit-scrollbar-thumb]:bg-white/25"
        )}
        style={{ maxHeight: "420px" }}
      >
        {totalShown === 0 ? (
          <p className="text-xs text-muted-foreground/60 py-6 text-center italic">
            No augments found
          </p>
        ) : (
          TIER_ORDER.map((tier) =>
            filtered[tier].length === 0 ? null : (
              <div key={tier} className="flex flex-col gap-1.5">
                <TierHeader tier={tier} count={filtered[tier].length} />
                <div className="grid grid-cols-[repeat(8,minmax(0,1fr))] gap-x-1.5 gap-y-2 justify-items-center">
                  {filtered[tier].map((a) => (
                    <DraggableAugmentTile key={a.apiName} augment={a} />
                  ))}
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}
