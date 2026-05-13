import { useState, useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Search } from "lucide-react";
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
      loading="lazy"
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

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      title={item.name}
      className={cn(
        "w-10 h-10 rounded-md overflow-hidden ring-1 ring-white/10 cursor-grab active:cursor-grabbing select-none transition-all duration-150 relative",
        "hover:ring-white/40 hover:scale-110 hover:brightness-110 hover:z-10",
        isDragging && "opacity-40"
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

export function ItemsPanel() {
  const { items } = useTFTData();
  const [activeTab, setActiveTab] = useState<TFTItemCategory>("normal");
  const [search, setSearch] = useState("");

  // Group by category — category is already on the model. The Normal bucket
  // is pre-sorted by inferred role so the grid scans Tank → Support → Flex →
  // AP → Fighter without any visible sub-tab.
  const byCategory = useMemo(() => {
    const map: Record<TFTItemCategory, TFTItem[]> = {
      normal: [],
      emblem: [],
      artifact: [],
      trait: [],
    };
    for (const item of items) {
      map[item.category].push(item);
    }
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
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 pl-6 pr-2 text-xs w-28 bg-background/50"
          />
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
                : "text-muted-foreground hover:text-foreground/70"
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
          "hover:[&::-webkit-scrollbar-thumb]:bg-white/25"
        )}
        style={{ maxHeight: "340px" }}
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
