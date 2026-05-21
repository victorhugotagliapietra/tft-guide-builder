import { memo, useState, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Search, X } from "lucide-react";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTItem, TFTItemCategory } from "@/features/tft-data/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS: TFTItemCategory[] = ["normal", "emblem", "artifact", "trait"];

const TAB_LABELS: Record<TFTItemCategory, string> = {
  normal: "Normal",
  emblem: "Emblems",
  artifact: "Artifact",
  trait: "Traits",
};

// Sort order for the Normal tab — tank/support are defensive/utility staples
// at the top; flex sits in the middle; AP/fighter rotate by composition.
const ROLE_SORT_ORDER: Record<NonNullable<TFTItem["role"]>, number> = {
  tank: 0,
  support: 1,
  flex: 2,
  ap: 3,
  fighter: 4,
};

// ---------------------------------------------------------------------------
// Item image with fallback
// ---------------------------------------------------------------------------

function ItemImg({ item, className }: { item: TFTItem; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!item.iconUrl || failed) {
    return (
      <div className={cn("bg-muted/40 flex items-center justify-center", className)}>
        <span className="text-[7px] text-muted-foreground text-center leading-tight px-0.5">
          {item.name.slice(0, 6)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={item.iconUrl}
      alt={item.name}
      className={cn("object-cover", className)}
      width={40}
      height={40}
      // Items panel: same low-priority async decode as the champion pool.
      // The grid is denser (50+ items at once) so this matters even more.
      loading="lazy"
      decoding="async"
      // @ts-expect-error fetchPriority valid HTML attr
      fetchpriority="low"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Draggable item tile — drag ID: "item:<apiName>"
// ---------------------------------------------------------------------------

export function DraggableItemTile({ item }: { item: TFTItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item:${item.apiName}`,
  });

  // No scale/transform on hover — the items grid is dense (7 columns) and any
  // size change caused layout shifts, overflow flicker, and hover oscillation
  // (the growing tile would push its own edge under/past the cursor). We keep
  // visual feedback to ring/brightness only so each tile's footprint is fixed.
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      title={item.name}
      className={cn(
        "w-10 h-10 rounded-md overflow-hidden ring-1 ring-white/10 cursor-grab active:cursor-grabbing select-none transition-[box-shadow,filter,background-color] duration-150 relative",
        "hover:ring-white/40 hover:brightness-110",
        isDragging && "opacity-40",
      )}
    >
      <ItemImg item={item} className="w-full h-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag overlay preview (rendered inside DragOverlay in BoardStepCard)
// ---------------------------------------------------------------------------

export function ItemDragOverlay({ item }: { item: TFTItem }) {
  return (
    <div className="w-10 h-10 rounded-md overflow-hidden ring-2 ring-primary/60 shadow-2xl select-none pointer-events-none">
      <ItemImg item={item} className="w-full h-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItemsPanel
// ---------------------------------------------------------------------------

function ItemsPanelImpl() {
  const { items } = useTFTData();
  const [activeTab, setActiveTab] = useState<TFTItemCategory>("normal");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Group by category. The Normal bucket is pre-sorted by inferred role so
  // the grid scans Tank → Support → Flex → AP → Fighter without a sub-tab.
  //
  // Two dedup layers (normalize.ts already dedupes upstream by apiName, but we
  // re-check here because the symptom — duplicates in the Normal grid — has
  // surfaced repeatedly):
  //   1. apiName Set: drops any second entry with the same TFT_Item_* key
  //   2. Normal-tab name Set: drops any second entry whose normalized display
  //      name is identical to one already kept. This catches cases where two
  //      *different* apiNames point at the same human-recognizable item
  //      (e.g. a duplicate emblem mistakenly classified as Normal, or a
  //      reroll-pool clone). Other tabs (Emblem/Artifact/Trait) skip the name
  //      check because they legitimately host items with overlapping names
  //      (e.g. trait items often share a base name with their universal cousin).
  const byCategory = useMemo(() => {
    const map: Record<TFTItemCategory, TFTItem[]> = {
      normal: [],
      emblem: [],
      artifact: [],
      trait: [],
    };
    const seenApi = new Set<string>();
    const seenNormalName = new Set<string>();
    let droppedDupApi = 0;
    let droppedDupName = 0;

    for (const item of items) {
      if (seenApi.has(item.apiName)) {
        droppedDupApi++;
        continue;
      }
      seenApi.add(item.apiName);

      if (item.category === "normal") {
        const key = item.name.trim().toLowerCase();
        if (seenNormalName.has(key)) {
          droppedDupName++;
          console.debug(`[TFT] Duplicate Normal item name dropped: ${item.name} (${item.apiName})`);
          continue;
        }
        seenNormalName.add(key);
      }

      map[item.category].push(item);
    }

    if (droppedDupApi > 0 || droppedDupName > 0) {
      console.info(
        `[TFT] Items panel dedup: apiName=${droppedDupApi}, normalName=${droppedDupName}`,
      );
    }

    // Sort returns a new array — we intentionally avoid mutating `items` and
    // the array we just constructed isn't shared externally, so in-place sort
    // here is safe and avoids an extra allocation per category.
    map.normal.sort((a, b) => {
      const ra = a.role ? ROLE_SORT_ORDER[a.role] : 99;
      const rb = b.role ? ROLE_SORT_ORDER[b.role] : 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
    return map;
  }, [items]);

  const visible = useMemo(() => {
    const list = byCategory[activeTab];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((i) => i.name.toLowerCase().includes(q));
  }, [byCategory, activeTab, search]);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
          Items
        </span>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 pl-6 pr-6 text-xs w-28 bg-background/50"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => {
                setSearch("");
                // Keep keyboard focus on the input so the user can keep typing
                // without re-clicking — matches native browser UX.
                searchInputRef.current?.focus();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-muted/20 rounded-md p-0.5">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 text-[10px] font-medium py-1 rounded transition-all",
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Items grid — strict 7 columns, icon-only for max density */}
      <div
        className={cn(
          "grid grid-cols-7 gap-1 overflow-y-auto pr-1 min-h-[80px] justify-items-center",
          "[&::-webkit-scrollbar]:w-1.5",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-white/10",
          "hover:[&::-webkit-scrollbar-thumb]:bg-white/25",
        )}
        style={{
          maxHeight: "340px",
          // Skip rendering off-screen item rows entirely (paint, decode, layout).
          // The grid scrolls vertically; below-the-fold tiles wait until needed.
          contentVisibility: "auto",
          containIntrinsicSize: "auto 280px",
        }}
      >
        {visible.map((item) => (
          <DraggableItemTile key={item.apiName} item={item} />
        ))}
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground/60 py-4 col-span-7 text-center italic">
            No items found
          </p>
        )}
      </div>
    </div>
  );
}

export const ItemsPanel = memo(ItemsPanelImpl);
