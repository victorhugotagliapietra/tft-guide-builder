import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
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
} from "lucide-react";
import { toast } from "sonner";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import { generatePlannerCode } from "@/features/tft-data/planner-code";
import type { TFTChampion, TFTItem } from "@/features/tft-data/types";
import { ItemDragOverlay } from "./ItemsPanel";
import { BOARD_SIZE } from "./grid";
import {
  STEP_TYPES,
  STEP_TYPE_LABELS,
  type BoardStep,
  type BoardUnit,
} from "./types";
import { BoardGrid } from "./BoardGrid";
import { ItemsPanel } from "./ItemsPanel";
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
//   "hex:<position>"  → board hex (drop target for champions & items, source for board units)
//   "panel:trash"     → champion/items panel area (drop target to remove a board unit)
//   "champion:<api>"  → draggable from champion pool (source only)
//   "item:<api>"      → draggable from item pool (source only)
//
// pointerWithin (not closestCenter) is used so that:
//   - dropping outside every zone yields `over === null` → triggers removal of
//     board units (closestCenter never returns null, which broke removal)
//   - large container droppables (panel:trash) never "win" over precise hexes
// ---------------------------------------------------------------------------

const dragCollisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return [];
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
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  // Reset failure flags when URLs change — fixes stale state when mock data is
  // replaced by real CDragon data after initial mount.
  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [champion.iconUrl, champion.fallbackIconUrl]);

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
 *   - matches name substring (case-insensitive)
 *   - matches any trait substring (case-insensitive)
 *   - Training Dummy is a special case: it ONLY appears for empty query or
 *     when the query is a substring of "training", "dummy", or
 *     "training dummy". This prevents the dummy from leaking into unrelated
 *     searches.
 *
 * The query is taken pre-lowercased to avoid recomputing it inside the loop.
 */
function matchesQuery(c: TFTChampion, q: string): boolean {
  if (!q) return true;

  if (isTrainingDummy(c)) {
    return (
      "training".includes(q) ||
      "dummy".includes(q) ||
      "training dummy".includes(q)
    );
  }

  if (c.name.toLowerCase().includes(q)) return true;
  for (const t of c.traits) {
    if (t.toLowerCase().includes(q)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Champion panel — droppable target for "remove via drag"
// ---------------------------------------------------------------------------

function ChampionPanel({
  onChampionClick,
  isRemoveTarget,
  isOver,
}: {
  onChampionClick: (apiName: string) => void;
  isRemoveTarget: boolean;
  isOver: boolean;
}) {
  const [search, setSearch] = useState("");
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
    <div
      className={cn(
        "flex flex-col gap-2 min-h-0 rounded-xl transition-colors p-3 border border-white/5 bg-background/30",
        isRemoveTarget && "ring-2 ring-destructive/50 border-destructive/40",
        isOver && isRemoveTarget && "bg-destructive/15"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
          {isRemoveTarget ? (
            <span className="text-destructive">Drop to remove</span>
          ) : (
            "Champions"
          )}
        </span>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 pl-6 pr-2 text-xs w-32 bg-background/50"
          />
        </div>
      </div>

      {/* Grid — fits all champions without scroll */}
      <div className="flex flex-wrap gap-x-1.5 gap-y-2">
        {filtered.map((champion) => (
          <DraggableChampionTile
            key={champion.apiName}
            champion={champion}
            onClick={onChampionClick}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground/60 py-4 w-full text-center italic">
            No champions found
          </p>
        )}
      </div>
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
  const { championMap, items: tftItems, setNumber } = useTFTData();

  const itemMap = useMemo(
    () => new Map(tftItems.map((i) => [i.apiName, i])),
    [tftItems]
  );

  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

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
    if (raw === "panel:trash") return { zone: "remove" };
    return { zone: "unknown" };
  }

  function handleDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    console.debug("[TFT][drag] start", { activeId: id, source: parseId(id) });
    setActiveDragId(id);
    setSelectedPos(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    setActiveDragId(null);

    const source = parseId(activeId);
    const destination = over ? parseId(overId) : { zone: "outside" as const };

    console.debug("[TFT][drag] end", { activeId, overId, source, destination });

    // ----- Source: board unit -----
    if (source.zone === "board") {
      // board → outside any droppable  ⇒ remove
      if (!over) {
        console.debug("[TFT][drag] board → outside ⇒ remove", source.pos);
        removeUnitAt(source.pos);
        return;
      }
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
      // Any other destination is ignored — but we still treat unrecognized
      // drops as a no-op rather than removing, to avoid surprising the user.
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

  const isDraggingFromPanel = !!(activeDragId?.startsWith("champion:"));
  const isDraggingFromBoard = !!(activeDragId?.startsWith("hex:"));
  const isDraggingItem = !!(activeDragId?.startsWith("item:"));

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
              <div className="overflow-x-auto rounded-lg">
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
            </div>

            {/* Two-column: champions (flex) + items (fixed 360px to fit a 7-icon
                grid) — entire area is the removal drop zone */}
            <div
              ref={setTrashRef}
              className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 pt-1 border-t border-border/40"
            >
              <ChampionPanel
                onChampionClick={placeChampionAtFirstEmpty}
                isRemoveTarget={isDraggingFromBoard}
                isOver={isTrashOver}
              />
              <div className="rounded-xl p-3 border border-white/5 bg-background/30">
                <ItemsPanel />
              </div>
            </div>

            <DragOverlay dropAnimation={null}>
              {overlayChampion && <DragOverlayContent champion={overlayChampion} />}
              {overlayItem && <ItemDragOverlay item={overlayItem} />}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}
