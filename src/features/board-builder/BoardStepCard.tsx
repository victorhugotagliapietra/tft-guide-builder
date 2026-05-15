import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  MeasuringStrategy,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  Link,
  Search,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  useTFTData,
  TRAINING_DUMMY_API_NAME,
  TRAINING_DUMMY_LOCAL_ICON,
} from "@/features/tft-data/use-tft-data";
import { generatePlannerCode } from "@/features/tft-data/planner-code";
import type { TFTChampion, TFTItem } from "@/features/tft-data/types";
import { ItemDragOverlay } from "./ItemsPanel";
import { AugmentDragOverlay, AugmentsPanel } from "./AugmentsPanel";
import { BOARD_SIZE } from "./grid";
import {
  STEP_TYPES,
  STEP_TYPE_LABELS,
  AUGMENT_SLOT_COUNT,
  emptyAugmentSlots,
  type BoardStep,
  type BoardUnit,
  type AugmentSlots,
} from "./types";
import { BoardGrid } from "./BoardGrid";
import { ItemsPanel } from "./ItemsPanel";
import { TraitsPanel } from "./TraitsPanel";
import { AugmentSlotsPanel } from "./AugmentSlotsPanel";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Drag zones — droppable IDs encode the zone type:
//   "hex:<position>"    → board hex (drop target for champions & items, source for board units)
//   "panel:trash"       → champions/augments/items panel area (drop target to remove a board unit)
//   "champion:<api>"    → draggable from champion pool (source only)
//   "item:<api>"        → draggable from item pool (source only)
//   "augment:<api>"     → draggable from augments pool (source only)
//   "augslot:<index>"   → augment slot (drop target only)
//   "slotaug:<index>"   → augment currently in slot N (source only — drag to swap/remove)
//
// pointerWithin (not closestCenter) is used so that:
//   - dropping outside every zone yields `over === null` → triggers removal of
//     board units or augment slots (closestCenter never returns null)
//   - large container droppables (panel:trash) never "win" over precise hexes
//
// Augment drags are *restricted* to augslot zones — they cannot ever resolve
// to a hex, the trash container, or anything else. This is enforced inside
// the collision detector below so misaimed drops simply cancel instead of
// silently landing somewhere unexpected.
// ---------------------------------------------------------------------------

const dragCollisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return [];

  const activeId = String(args.active.id);

  // Augment drags (from pool or from an existing slot) may only target an
  // augment slot. Everything else cancels (returns []) so the drop becomes a
  // no-op or — for slot sources — a "remove" via `over === null` in dragEnd.
  if (activeId.startsWith("augment:") || activeId.startsWith("slotaug:")) {
    const slot = hits.find((c) => String(c.id).startsWith("augslot:"));
    return slot ? [slot] : [];
  }

  // Hex always wins over the surrounding trash container — otherwise an
  // occupied hex inside the trash zone could ambiguously resolve to trash.
  const hex = hits.find((c) => String(c.id).startsWith("hex:"));
  if (hex) return [hex];
  const trash = hits.find((c) => String(c.id) === "panel:trash");
  if (trash) return [trash];
  return [];
};

// ---------------------------------------------------------------------------
// Cost-tier styling (matches BoardGrid hex border colors)
// ---------------------------------------------------------------------------

const COST_RING: Record<number, string> = {
  0: "ring-1 ring-zinc-500/50",
  1: "ring-1 ring-slate-400/60",
  2: "ring-2 ring-green-500/70",
  3: "ring-2 ring-blue-500/70",
  4: "ring-2 ring-purple-500/80",
  5: "ring-2 ring-yellow-400/90 shadow-[0_0_6px_1px_rgba(250,204,21,0.25)]",
};

const COST_NAME_COLOR: Record<number, string> = {
  0: "text-zinc-400",
  1: "text-slate-300",
  2: "text-green-400",
  3: "text-blue-400",
  4: "text-purple-400",
  5: "text-yellow-400",
};

// ---------------------------------------------------------------------------
// Champion image with 2-step fallback
// ---------------------------------------------------------------------------

function ChampionImg({
  champion,
  className,
}: {
  champion: TFTChampion;
  className?: string;
}) {
  // Hooks must run unconditionally before any early return — the Training
  // Dummy short-circuit happens AFTER the hooks so re-renders with different
  // champion props don't change the hook-call order.
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  // Reset failure flags when URLs change — fixes stale state when mock data is
  // replaced by real CDragon data after initial mount.
  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [champion.iconUrl, champion.fallbackIconUrl]);

  // Training Dummy short-circuit: always render the local asset, never touch
  // the fallback chain or CDragon/rerollcdn URLs. This keeps the dummy image
  // identical across the champions list, board hexes, and drag overlay, and
  // prevents the generic error-fallback path from accidentally loading a
  // 404'd CDN sentinel image in its place.
  if (champion.apiName === TRAINING_DUMMY_API_NAME) {
    return (
      <img
        src={TRAINING_DUMMY_LOCAL_ICON}
        alt={champion.name}
        className={cn("object-cover", className)}
        loading="eager"
        draggable={false}
      />
    );
  }

  const src =
    !primaryFailed && champion.iconUrl ? champion.iconUrl
    : !fallbackFailed && champion.fallbackIconUrl ? champion.fallbackIconUrl
    : null;

  if (!src) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/30 text-[8px] text-muted-foreground text-center leading-tight px-0.5", className)}>
        {champion.name.slice(0, 8)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={champion.name}
      className={cn("object-cover", className)}
      loading="eager"
      draggable={false}
      onError={() => {
        if (!primaryFailed && src === champion.iconUrl) {
          console.debug(`[TFT] Primary icon failed for ${champion.name}, trying fallback`);
          setPrimaryFailed(true);
        } else {
          console.debug(`[TFT] All icons failed for ${champion.name}`);
          setFallbackFailed(true);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Draggable + clickable champion tile
// ---------------------------------------------------------------------------

function DraggableChampionTile({
  champion,
  onClick,
}: {
  champion: TFTChampion;
  onClick: (apiName: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `champion:${champion.apiName}`,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      title={champion.name}
      onClick={() => onClick(champion.apiName)}
      className={cn(
        "group flex flex-col items-center gap-1 cursor-pointer select-none transition-all duration-100",
        isDragging && "opacity-40"
      )}
    >
      <div
        className={cn(
          "w-11 h-11 rounded-lg overflow-hidden transition-all duration-150",
          COST_RING[champion.cost] ?? COST_RING[1],
          "group-hover:scale-110 group-hover:brightness-110"
        )}
      >
        <ChampionImg champion={champion} className="w-full h-full" />
      </div>
      <span
        className={cn(
          "text-[9px] leading-none text-center truncate w-12",
          COST_NAME_COLOR[champion.cost] ?? "text-muted-foreground",
          "group-hover:brightness-125"
        )}
      >
        {champion.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag overlay
// ---------------------------------------------------------------------------

function DragOverlayContent({ champion }: { champion: TFTChampion }) {
  return (
    <div className="flex flex-col items-center gap-1 select-none pointer-events-none">
      <div className={cn("w-11 h-11 rounded-lg overflow-hidden shadow-2xl", COST_RING[champion.cost] ?? COST_RING[1])}>
        <ChampionImg champion={champion} className="w-full h-full" />
      </div>
      <span className={cn("text-[9px] leading-none text-center", COST_NAME_COLOR[champion.cost] ?? "text-muted-foreground")}>
        {champion.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort: cost asc, then name; specials always at the end
// ---------------------------------------------------------------------------

const SPECIAL_NAMES = new Set([
  "Golem",
  "Training Dummy",
  "Practice Dummy",
  "Rift Scuttler",
  "Mini Black Ball",
  "Golden Ox",
]);

function isSpecial(c: TFTChampion): boolean {
  return (
    !c.apiName.startsWith("TFT17_") ||
    c.cost === 0 ||
    SPECIAL_NAMES.has(c.name)
  );
}

function isTrainingDummy(c: TFTChampion): boolean {
  const lower = c.name.toLowerCase();
  return lower.includes("training") && lower.includes("dummy");
}

function sortChampions(champions: TFTChampion[]): TFTChampion[] {
  return [...champions].sort((a, b) => {
    const aS = isSpecial(a);
    const bS = isSpecial(b);
    if (aS !== bS) return aS ? 1 : -1;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Match a champion against a free-form search query.
 *
 * Behavior:
 *   - empty query → match everything
 *   - leading numeric token (1-5) becomes a strict cost filter:
 *       "1"         → all cost-1 champions
 *       "2 inv"     → cost-2 champions whose name OR a trait contains "inv"
 *       "4 pri"     → cost-4 champions whose name OR a trait contains "pri"
 *     The cost prefix MUST be followed by a space (or end-of-string), so
 *     "11" / "12" don't accidentally trigger cost filtering — they fall
 *     through to name/trait substring search as before.
 *   - otherwise: matches name substring (case-insensitive) OR any trait
 *     substring (case-insensitive)
 *   - Training Dummy is a special case: it ONLY appears for empty query or
 *     when the query is a substring of "training", "dummy", or "training
 *     dummy". Numeric cost searches never include it (cost-0 unit anyway,
 *     and the dummy is gated before cost-filter logic runs).
 *
 * The query is pre-lowercased + trimmed by the caller.
 */
const COST_PREFIX_RE = /^([1-5])(?:\s+(.*))?$/;

function matchesQuery(c: TFTChampion, q: string): boolean {
  if (!q) return true;

  // Training Dummy gating runs first so a cost-only query like "1" cannot
  // accidentally show the dummy, and a name-only query like "training" still
  // matches it.
  if (isTrainingDummy(c)) {
    return (
      "training".includes(q) ||
      "dummy".includes(q) ||
      "training dummy".includes(q)
    );
  }

  // Cost-prefix filter — `N`-only or `N <rest>`. When `<rest>` is present it
  // applies name+trait matching to the rest after the cost filter passes;
  // when absent, every cost-N champion matches.
  const costMatch = COST_PREFIX_RE.exec(q);
  if (costMatch) {
    const requiredCost = parseInt(costMatch[1], 10);
    if (c.cost !== requiredCost) return false;
    const rest = (costMatch[2] ?? "").trim();
    if (!rest) return true;
    if (c.name.toLowerCase().includes(rest)) return true;
    for (const t of c.traits) {
      if (t.toLowerCase().includes(rest)) return true;
    }
    return false;
  }

  // No cost prefix — original name/trait substring match.
  if (c.name.toLowerCase().includes(q)) return true;
  for (const t of c.traits) {
    if (t.toLowerCase().includes(q)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Champion panel content — the outer card wrapper (and trash-target styling)
// is supplied by the tabbed shell in BoardStepCard so the Champions/Augments
// tabs can share a single visual frame.
// ---------------------------------------------------------------------------

function ChampionPanelContent({
  onChampionClick,
}: {
  onChampionClick: (apiName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { champions } = useTFTData();

  const sorted = useMemo(() => sortChampions(champions), [champions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    // matchesQuery handles name + trait substring matching and the special
    // Training-Dummy gating rule. Filter is pure — sorted is never mutated.
    const result = sorted.filter((c) => matchesQuery(c, q));
    console.debug(`[TFT] Champion search "${q}" → ${result.length} matches`);
    return result;
  }, [sorted, search]);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Header — search lives on the right; the section label is owned by
          the tab bar above and is intentionally not duplicated here. */}
      <div className="flex items-center justify-end gap-2">
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
                // Clearing search restores `sorted` as the filtered list —
                // the same array reference reused, so no re-allocation and
                // crucially no chance of duplicate-Training-Dummy entries
                // (champion dedup happens in useTFTData, never per-render).
                setSearch("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <XIcon className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Grid — strict 14 columns, yields ~5 rows for the full Set 17 roster */}
      <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-x-1.5 gap-y-2 justify-items-center">
        {filtered.map((champion) => (
          <DraggableChampionTile
            key={champion.apiName}
            champion={champion}
            onClick={onChampionClick}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground/60 py-4 [grid-column:1/-1] text-center italic">
            No champions found
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabbed pool shell — wraps Champions/Augments content in a single card and
// inherits the "drop to remove" highlighting that previously lived on the
// champion panel. Tab state is owned by the parent so the active tab persists
// across re-renders and external state changes don't reset it.
// ---------------------------------------------------------------------------

type PoolTab = "champions" | "augments";

function PoolPanel({
  activeTab,
  onTabChange,
  onChampionClick,
  isRemoveTarget,
  isOver,
}: {
  activeTab: PoolTab;
  onTabChange: (tab: PoolTab) => void;
  onChampionClick: (apiName: string) => void;
  isRemoveTarget: boolean;
  isOver: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 min-h-0 rounded-xl transition-colors p-3 border border-white/5 bg-background/30",
        isRemoveTarget && "ring-2 ring-destructive/50 border-destructive/40",
        isOver && isRemoveTarget && "bg-destructive/15"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Tab bar */}
        <div className="flex gap-0.5 bg-muted/20 rounded-md p-0.5">
          {(["champions", "augments"] as PoolTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase rounded transition-all",
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {tab === "champions" ? "Champions" : "Augments"}
            </button>
          ))}
        </div>

        {/* Remove-target hint */}
        {isRemoveTarget && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive">
            Drop to remove
          </span>
        )}
      </div>

      {/* Content swap — keep both panels mounted is overkill for this app,
          so we render only the active one. Search state inside each panel
          will reset on tab change, which is the expected behavior. */}
      {activeTab === "champions" ? (
        <ChampionPanelContent onChampionClick={onChampionClick} />
      ) : (
        <AugmentsPanel />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  step: BoardStep;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: string, patch: Partial<BoardStep>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
};

// ---------------------------------------------------------------------------
// BoardStepCard
// ---------------------------------------------------------------------------

export function BoardStepCard({
  step,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onDuplicate,
}: Props) {
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description);
  // Local input text for level so the user can clear the field while typing
  const [levelText, setLevelText] = useState(String(step.level));
  const { championMap, augmentMap, items: tftItems, setNumber } = useTFTData();

  const itemMap = useMemo(
    () => new Map(tftItems.map((i) => [i.apiName, i])),
    [tftItems]
  );

  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Ref to the board container — used by handleDragEnd to distinguish between
  // "user dropped a unit in the gap between hexes" (cancel, no-op) and "user
  // dragged the unit fully outside the board" (remove). The board container is
  // the BoardGrid wrapper div; we attach the ref there in the JSX below.
  const boardContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync external step.level changes back into the input
  useEffect(() => {
    setLevelText(String(step.level));
  }, [step.level]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // -------------------------------------------------------------------------
  // Drag handlers
  // -------------------------------------------------------------------------

  // Parse a draggable/droppable ID into its zone + payload.
  type ParsedId =
    | { zone: "board"; pos: number }
    | { zone: "champion-pool"; apiName: string }
    | { zone: "item-pool"; apiName: string }
    | { zone: "augment-pool"; apiName: string }
    | { zone: "augment-slot"; index: number }   // droppable target
    | { zone: "slot-aug"; index: number }       // draggable from a slot (source)
    | { zone: "remove" }
    | { zone: "unknown" };

  function parseId(raw: string | null | undefined): ParsedId {
    if (!raw) return { zone: "unknown" };
    if (raw.startsWith("hex:")) {
      return { zone: "board", pos: parseInt(raw.slice(4), 10) };
    }
    if (raw.startsWith("champion:")) {
      return { zone: "champion-pool", apiName: raw.slice(9) };
    }
    if (raw.startsWith("item:")) {
      return { zone: "item-pool", apiName: raw.slice(5) };
    }
    if (raw.startsWith("augment:")) {
      return { zone: "augment-pool", apiName: raw.slice(8) };
    }
    if (raw.startsWith("augslot:")) {
      return { zone: "augment-slot", index: parseInt(raw.slice(8), 10) };
    }
    if (raw.startsWith("slotaug:")) {
      return { zone: "slot-aug", index: parseInt(raw.slice(8), 10) };
    }
    if (raw === "panel:trash") return { zone: "remove" };
    return { zone: "unknown" };
  }

  function handleDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    console.debug("[TFT][drag] start", { activeId: id, source: parseId(id) });
    setActiveDragId(id);
    setSelectedPos(null);
  }

  /**
   * Was the pointer still inside the board container's bounding box when the
   * drag ended? Used to distinguish "dropped in the gap between two hexes"
   * (cancel, NOT remove) from "dragged fully outside the board" (remove).
   *
   * We derive the final pointer position from the activator event's clientX/Y
   * plus dnd-kit's accumulated `delta`. Returns false defensively if any
   * piece is unavailable, so the worst case is "treated as outside" — which
   * the caller then routes through additional zone checks before removing.
   */
  function isPointerInsideBoard(
    activatorEvent: DragEndEvent["activatorEvent"],
    delta: DragEndEvent["delta"]
  ): boolean {
    const el = boardContainerRef.current;
    if (!el) return false;
    // PointerEvent / MouseEvent / TouchEvent — read clientX/Y from whichever shape.
    const ev = activatorEvent as PointerEvent | MouseEvent | TouchEvent | null;
    let startX: number | undefined;
    let startY: number | undefined;
    if (ev && "clientX" in ev) {
      startX = (ev as PointerEvent).clientX;
      startY = (ev as PointerEvent).clientY;
    } else if (ev && "touches" in ev && ev.touches[0]) {
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
    }
    if (startX === undefined || startY === undefined) return false;
    const x = startX + delta.x;
    const y = startY + delta.y;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function handleDragEnd({ active, over, activatorEvent, delta }: DragEndEvent) {
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    setActiveDragId(null);

    const source = parseId(activeId);
    const destination = over ? parseId(overId) : { zone: "outside" as const };

    console.debug("[TFT][drag] end", { activeId, overId, source, destination });

    // ----- Source: board unit -----
    if (source.zone === "board") {
      // board → remove zone (champion/items panel)  ⇒ remove
      if (destination.zone === "remove") {
        console.debug("[TFT][drag] board → remove zone ⇒ remove", source.pos);
        removeUnitAt(source.pos);
        return;
      }
      // board → board  ⇒ move or swap
      if (destination.zone === "board") {
        moveOrSwap(source.pos, destination.pos);
        return;
      }
      // Neither a hex nor the trash zone was hit. Removal here used to be
      // unconditional, but that punished users for dropping a champion in
      // the small empty space between hexes. New rule: only remove if the
      // pointer was actually OUTSIDE the board container when released —
      // otherwise treat the drop as a forgiving no-op and leave the unit
      // where it started.
      const stayedOnBoard = isPointerInsideBoard(activatorEvent, delta);
      if (stayedOnBoard) {
        console.debug("[TFT][drag] board → gap inside board ⇒ revert", source.pos);
        return;
      }
      console.debug("[TFT][drag] board → outside board ⇒ remove", source.pos);
      removeUnitAt(source.pos);
      return;
    }

    // ----- Source: champion pool -----
    if (source.zone === "champion-pool") {
      if (destination.zone === "board") {
        placeChampion(source.apiName, destination.pos);
      }
      return;
    }

    // ----- Source: item pool -----
    if (source.zone === "item-pool") {
      if (destination.zone !== "board") return;
      const targetUnit = step.units.find((u) => u.position === destination.pos);
      if (!targetUnit) return; // empty hex — items need a champion
      if ((targetUnit.items?.length ?? 0) >= 3) {
        toast.error("Champions can hold at most 3 items");
        return;
      }
      onUpdate(step.id, {
        units: step.units.map((u) =>
          u.position === destination.pos
            ? { ...u, items: [...(u.items ?? []), source.apiName] }
            : u
        ),
      });
      return;
    }

    // ----- Source: augment pool -----
    if (source.zone === "augment-pool") {
      // Only augment slots can be targets — the collision detector already
      // restricts this, but we re-check defensively so the contract is local.
      if (destination.zone !== "augment-slot") return;
      assignAugmentToSlot(source.apiName, destination.index);
      return;
    }

    // ----- Source: an augment already in a slot -----
    if (source.zone === "slot-aug") {
      // slot → outside any droppable  ⇒ remove
      if (!over) {
        removeAugmentFromSlot(source.index);
        return;
      }
      // slot → slot  ⇒ swap (or move into empty slot)
      if (destination.zone === "augment-slot") {
        moveOrSwapAugments(source.index, destination.index);
        return;
      }
      // slot → remove zone  ⇒ remove
      if (destination.zone === "remove") {
        removeAugmentFromSlot(source.index);
        return;
      }
      return;
    }
  }

  function handleDragCancel() {
    console.debug("[TFT][drag] cancel");
    setActiveDragId(null);
  }

  // -------------------------------------------------------------------------
  // Board mutation
  // -------------------------------------------------------------------------

  function placeChampion(apiName: string, targetPos: number) {
    if (step.units.some((u) => u.position === targetPos)) return;
    const newUnit: BoardUnit = {
      id: crypto.randomUUID(),
      championKey: apiName,
      position: targetPos,
      items: [],
      starLevel: 0,
      isCarry: false,
      isItemHolder: false,
    };
    onUpdate(step.id, { units: [...step.units, newUnit] });
  }

  function placeChampionAtFirstEmpty(apiName: string) {
    const occupied = new Set(step.units.map((u) => u.position));
    for (let pos = 0; pos < BOARD_SIZE; pos++) {
      if (!occupied.has(pos)) {
        placeChampion(apiName, pos);
        return;
      }
    }
    toast.error("Board is full");
  }

  function moveOrSwap(fromPos: number, targetPos: number) {
    if (fromPos === targetPos) return;
    const hasTarget = step.units.some((u) => u.position === targetPos);
    onUpdate(step.id, {
      units: step.units.map((u) => {
        if (u.position === fromPos) return { ...u, position: targetPos };
        if (hasTarget && u.position === targetPos) return { ...u, position: fromPos };
        return u;
      }),
    });
    setSelectedPos(null);
  }

  function removeUnitAt(pos: number) {
    onUpdate(step.id, { units: step.units.filter((u) => u.position !== pos) });
    setSelectedPos(null);
  }

  // -------------------------------------------------------------------------
  // Augment slot mutation
  // -------------------------------------------------------------------------
  //
  // `step.augments` is guaranteed to be a length-4 array by the zod schema,
  // but defensive: if a guide was saved before this field existed, parsing
  // applies the default. We use a getter so every helper sees a stable shape.

  const augmentSlots: AugmentSlots = useMemo(() => {
    const raw = step.augments;
    if (!Array.isArray(raw)) return emptyAugmentSlots();
    if (raw.length === AUGMENT_SLOT_COUNT) return raw as AugmentSlots;
    // Length mismatch (e.g. step saved when AUGMENT_SLOT_COUNT was 4 and we
    // now render with 6, or vice-versa): pad/truncate without losing data.
    // Existing assignments stay in their original slot indices, extra slots
    // fill with null. Persistence picks up the new shape on the next save.
    const out: AugmentSlots = emptyAugmentSlots();
    const copyN = Math.min(raw.length, AUGMENT_SLOT_COUNT);
    for (let i = 0; i < copyN; i++) out[i] = raw[i] ?? null;
    return out;
  }, [step.augments]);

  /**
   * Assign an augment apiName to a slot.
   *
   * Enforces "no duplicate augment assignments" by clearing any other slot
   * that already contains this apiName. This converts "drag the same augment
   * into a different slot" into a move, which feels natural to the user.
   */
  function assignAugmentToSlot(apiName: string, slotIdx: number) {
    if (slotIdx < 0 || slotIdx >= AUGMENT_SLOT_COUNT) return;
    const next = augmentSlots.map((cur, i) => {
      if (i === slotIdx) return apiName;
      if (cur === apiName) return null; // remove duplicate from prior slot
      return cur;
    });
    onUpdate(step.id, { augments: next });
  }

  /**
   * Swap two augment slots (or move into an empty slot).
   * No-op if either index is out of range or the slots are identical.
   */
  function moveOrSwapAugments(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || toIdx < 0) return;
    if (fromIdx >= AUGMENT_SLOT_COUNT || toIdx >= AUGMENT_SLOT_COUNT) return;
    const fromVal = augmentSlots[fromIdx] ?? null;
    if (!fromVal) return;
    const toVal = augmentSlots[toIdx] ?? null;
    const next = augmentSlots.map((cur, i) => {
      if (i === fromIdx) return toVal;
      if (i === toIdx) return fromVal;
      return cur;
    });
    onUpdate(step.id, { augments: next });
  }

  function removeAugmentFromSlot(slotIdx: number) {
    if (slotIdx < 0 || slotIdx >= AUGMENT_SLOT_COUNT) return;
    const next = augmentSlots.map((cur, i) => (i === slotIdx ? null : cur));
    onUpdate(step.id, { augments: next });
  }

  function handleRemoveItem(pos: number, itemIndex: number) {
    onUpdate(step.id, {
      units: step.units.map((u) =>
        u.position === pos
          ? { ...u, items: u.items.filter((_, i) => i !== itemIndex) }
          : u
      ),
    });
  }

  function handleSetStarLevel(pos: number, level: number) {
    const clamped = Math.max(0, Math.min(3, level));
    onUpdate(step.id, {
      units: step.units.map((u) =>
        u.position === pos ? { ...u, starLevel: clamped } : u
      ),
    });
  }

  function handleCopyPlannerCode() {
    const result = generatePlannerCode(step.units, setNumber);
    if (!result.ok) { toast.error(result.error); return; }
    navigator.clipboard.writeText(result.code).then(
      () => toast.success("Planner code copied!"),
      () => toast.error("Failed to write to clipboard.")
    );
  }

  // -------------------------------------------------------------------------
  // Overlay champion (for DragOverlay preview)
  // -------------------------------------------------------------------------

  const overlayChampion: TFTChampion | null = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("champion:"))
      return championMap.get(activeDragId.replace("champion:", "")) ?? null;
    if (activeDragId.startsWith("hex:")) {
      const pos = parseInt(activeDragId.replace("hex:", ""), 10);
      const unit = step.units.find((u) => u.position === pos);
      return unit ? (championMap.get(unit.championKey) ?? null) : null;
    }
    return null;
  }, [activeDragId, championMap, step.units]);

  const overlayItem: TFTItem | null = useMemo(() => {
    if (!activeDragId?.startsWith("item:")) return null;
    return itemMap.get(activeDragId.replace("item:", "")) ?? null;
  }, [activeDragId, itemMap]);

  // Overlay preview for both augment-pool drags and slot drags.
  const overlayAugment = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("augment:")) {
      return augmentMap.get(activeDragId.slice("augment:".length)) ?? null;
    }
    if (activeDragId.startsWith("slotaug:")) {
      const idx = parseInt(activeDragId.slice("slotaug:".length), 10);
      const api = augmentSlots[idx];
      return api ? augmentMap.get(api) ?? null : null;
    }
    return null;
  }, [activeDragId, augmentMap, augmentSlots]);

  const isDraggingFromPanel = !!(activeDragId?.startsWith("champion:"));
  const isDraggingFromBoard = !!(activeDragId?.startsWith("hex:"));
  const isDraggingItem = !!(activeDragId?.startsWith("item:"));
  // True for both augment-pool drags and assigned-slot drags — used to:
  //   - highlight droppable slots in AugmentSlotsPanel
  //   - signal the trash zone for "drag-out-to-remove" on assigned slots
  const isDraggingAugment =
    !!(activeDragId?.startsWith("augment:")) ||
    !!(activeDragId?.startsWith("slotaug:"));
  const isDraggingFromSlot = !!(activeDragId?.startsWith("slotaug:"));

  // Pool tab state — survives drag interactions because it's owned at the
  // step-card level (not inside PoolPanel) so we don't lose the user's tab
  // selection when the tree re-renders during a drag.
  const [poolTab, setPoolTab] = useState<PoolTab>("champions");

  const { isOver: isTrashOver, setNodeRef: setTrashRef } = useDroppable({ id: "panel:trash" });

  // -------------------------------------------------------------------------
  // Header summary
  // -------------------------------------------------------------------------

  const unitCount = step.units.length;
  const previewNames = step.units
    .slice(0, 3)
    .map((u) => championMap.get(u.championKey)?.name ?? u.championKey)
    .join(", ");

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-card/50 backdrop-blur-sm">
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-muted/20 transition-colors",
          isExpanded && "border-b border-border/50"
        )}
        onClick={onToggleExpand}
      >
        <span className="shrink-0 text-muted-foreground/60">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{step.title}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-white/10 text-muted-foreground">
              {STEP_TYPE_LABELS[step.stepType]}
            </Badge>
            <span className="text-xs text-muted-foreground/60 shrink-0">Lv{step.level}</span>
          </div>
          {!isExpanded && unitCount > 0 && (
            <p className="text-xs text-muted-foreground/50 mt-0.5 truncate">
              {unitCount} unit{unitCount !== 1 ? "s" : ""}
              {previewNames ? ` — ${previewNames}${unitCount > 3 ? "…" : ""}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-foreground" onClick={() => onDuplicate(step.id)} title="Duplicate step">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/60 hover:text-destructive" title="Delete step">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{step.title}"?</AlertDialogTitle>
                <AlertDialogDescription>This board step will be removed permanently after saving.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRemove(step.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Metadata */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => onUpdate(step.id, { title: title.trim() || "New board" })}
                placeholder="e.g. Level 6 stabilize"
                className="h-8 text-sm bg-background/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Level</Label>
              <Input
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                value={levelText}
                onChange={(e) => {
                  const text = e.target.value;
                  setLevelText(text);
                  if (text === "") return; // allow empty while editing
                  const val = parseInt(text, 10);
                  if (!isNaN(val) && val >= 1 && val <= 10) onUpdate(step.id, { level: val });
                }}
                onBlur={() => {
                  // Snap back to the last valid level if user left it empty/invalid
                  const val = parseInt(levelText, 10);
                  if (isNaN(val) || val < 1 || val > 10) {
                    setLevelText(String(step.level));
                  }
                }}
                className="h-8 text-sm bg-background/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={step.stepType}
                onValueChange={(val) => onUpdate(step.id, { stepType: val as BoardStep["stepType"] })}
              >
                <SelectTrigger className="h-8 text-sm bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{STEP_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <RichTextEditor
              value={description}
              onChange={(html) => setDescription(html)}
              onBlur={() => onUpdate(step.id, { description })}
              placeholder="When to roll, when to level, who holds items…"
            />
          </div>

          {/* Board + panels */}
          <DndContext
            sensors={sensors}
            collisionDetection={dragCollisionDetection}
            modifiers={[snapCenterToCursor]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            // Recompute droppable rects continuously while dragging so the
            // collision detector stays accurate during page scroll (otherwise
            // dnd-kit caches positions at drag-start and drops can miss the
            // correct hex/slot if the user scrolls the page mid-drag).
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Board</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground/60 hover:text-muted-foreground gap-1"
                  disabled={unitCount === 0}
                  onClick={handleCopyPlannerCode}
                >
                  <Link className="h-3 w-3" />
                  Copy planner code
                </Button>
              </div>
              {/* Board flanked by traits (left) and augment slots (right).
                  CRITICAL LAYOUT NOTE: the board wrapper deliberately does
                  NOT use `flex-1`. With flex-1 the wrapper expanded to fill
                  every available pixel and the hex grid (which is absolutely
                  sized to HEX_CONTAINER_W) sat in the left portion — leaving
                  hundreds of empty pixels between the rightmost hex and the
                  augment panel. By giving each child its natural width and
                  centering the row with `justify-center`, the augment panel
                  ends up adjacent to the board's actual right edge, with
                  symmetric breathing room on either side. `overflow-x-auto`
                  on the parent handles narrow viewports without breaking
                  drag-target alignment. */}
              <div className="flex items-start justify-center gap-2 overflow-x-auto">
                <TraitsPanel units={step.units} />
                <div ref={boardContainerRef} className="rounded-lg shrink-0">
                  <BoardGrid
                    units={step.units}
                    selectedPos={selectedPos}
                    onHexClick={(pos) => setSelectedPos((p) => (p === pos ? null : pos))}
                    onSetStarLevel={handleSetStarLevel}
                    onRemoveItem={handleRemoveItem}
                    isDraggingFromPanel={isDraggingFromPanel}
                    isDraggingItem={isDraggingItem}
                  />
                </div>
                <AugmentSlotsPanel
                  slots={augmentSlots}
                  isDraggingAugment={isDraggingAugment}
                />
              </div>
            </div>

            {/* Two-column: pool (Champions/Augments tabs, flex) + items (fixed
                380px to fit a 7-icon grid at the new 10% smaller tile size
                with extra breathing room) — entire area is the removal drop
                zone for both board units AND assigned augments. */}
            <div
              ref={setTrashRef}
              className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 pt-1 border-t border-border/40"
            >
              <PoolPanel
                activeTab={poolTab}
                onTabChange={setPoolTab}
                onChampionClick={placeChampionAtFirstEmpty}
                isRemoveTarget={isDraggingFromBoard || isDraggingFromSlot}
                isOver={isTrashOver}
              />
              <div className="rounded-xl p-3 border border-white/5 bg-background/30">
                <ItemsPanel />
              </div>
            </div>

            {/* Portal the DragOverlay to <body> so its `position: fixed`
                resolves against the viewport, not the nearest ancestor with a
                CSS `backdrop-filter` (which would create a containing block
                and pin the overlay to that ancestor instead — manifesting as
                "overlay frozen while page scrolls"). React preserves the
                DndContext through the portal, so the overlay still receives
                dnd-kit's positioning + modifier updates. */}
            {typeof document !== "undefined" &&
              createPortal(
                <DragOverlay dropAnimation={null}>
                  {overlayChampion && <DragOverlayContent champion={overlayChampion} />}
                  {overlayItem && <ItemDragOverlay item={overlayItem} />}
                  {overlayAugment && <AugmentDragOverlay augment={overlayAugment} />}
                </DragOverlay>,
                document.body
              )}
          </DndContext>
        </div>
      )}
    </div>
  );
}
