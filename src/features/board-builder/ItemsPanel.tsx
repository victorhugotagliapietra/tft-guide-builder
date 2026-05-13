import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTItem } from "@/features/tft-data/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Item category classification
// ---------------------------------------------------------------------------

type ItemTab = "normal" | "emblem" | "artifact" | "radiant" | "component";

const TAB_LABELS: Record<ItemTab, string> = {
  normal: "Normal",
  emblem: "Emblems",
  artifact: "Artifact",
  radiant: "Radiant",
  component: "Components",
};

const TABS: ItemTab[] = ["normal", "emblem", "artifact", "radiant", "component"];

function categorize(item: TFTItem): ItemTab {
  const api = item.apiName.toLowerCase();
  const name = item.name.toLowerCase();
  if (item.isComponent) return "component";
  if (item.isEmblem) return "emblem";
  if (api.includes("radiant") || name.includes("radiant")) return "radiant";
  if (
    api.includes("artifact") ||
    api.includes("ornn") ||
    name.includes("artifact")
  )
    return "artifact";
  return "normal";
}

// ---------------------------------------------------------------------------
// Item image with fallback
// ---------------------------------------------------------------------------

function ItemImg({
  item,
  className,
}: {
  item: TFTItem;
  className?: string;
}) {
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
// Single item tile
// ---------------------------------------------------------------------------

function ItemTile({ item }: { item: TFTItem }) {
  return (
    <div
      title={item.name}
      className="flex flex-col items-center gap-0.5 w-[46px] group cursor-pointer"
    >
      <div className="w-9 h-9 rounded-md overflow-hidden ring-1 ring-white/10 transition-all duration-150 group-hover:ring-white/30 group-hover:scale-110 group-hover:brightness-110">
        <ItemImg item={item} className="w-full h-full" />
      </div>
      <span className="text-[8px] text-muted-foreground/70 text-center leading-tight truncate w-full text-center group-hover:text-muted-foreground">
        {item.name.length > 8 ? item.name.slice(0, 7) + "…" : item.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItemsPanel
// ---------------------------------------------------------------------------

export function ItemsPanel() {
  const { items } = useTFTData();
  const [activeTab, setActiveTab] = useState<ItemTab>("normal");
  const [search, setSearch] = useState("");

  const byTab = useMemo(() => {
    const map: Record<ItemTab, TFTItem[]> = {
      normal: [],
      emblem: [],
      artifact: [],
      radiant: [],
      component: [],
    };
    for (const item of items) {
      map[categorize(item)].push(item);
    }
    return map;
  }, [items]);

  const visible = useMemo(() => {
    const list = byTab[activeTab];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((i) => i.name.toLowerCase().includes(q));
  }, [byTab, activeTab, search]);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Header row */}
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

      {/* Items grid */}
      <div
        className={cn(
          "flex flex-wrap gap-x-1.5 gap-y-2 overflow-y-auto pr-1 min-h-[80px]",
          // Modern minimal scrollbar
          "[&::-webkit-scrollbar]:w-1",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-white/10",
          "hover:[&::-webkit-scrollbar-thumb]:bg-white/20"
        )}
        style={{ maxHeight: "220px" }}
      >
        {visible.map((item) => (
          <ItemTile key={item.apiName} item={item} />
        ))}
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground/60 py-4 w-full text-center italic">
            No items found
          </p>
        )}
      </div>
    </div>
  );
}
