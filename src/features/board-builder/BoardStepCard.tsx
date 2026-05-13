import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
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
import type { TFTChampion } from "@/features/tft-data/types";
import {
  STEP_TYPES,
  STEP_TYPE_LABELS,
  type BoardStep,
  type BoardUnit,
} from "./types";
import { BoardGrid } from "./BoardGrid";
import { ItemsPanel } from "./ItemsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
// Cost-tier ring / glow — Image 5 inspired style
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
// Champion image — 2-step fallback
// ---------------------------------------------------------------------------

function ChampionImg({
  champion,
  className,
}: {
  champion: TFTChampion;
  className?: string;
}) {
  const [imgState, setImgState] = useState<"primary" | "fallback" | "failed">(
    champion.iconUrl ? "primary" : champion.fallbackIconUrl ? "fallback" : "failed"
  );

  if (imgState === "failed" || (!champion.iconUrl && !champion.fallbackIconUrl)) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/30 text-[8px] text-muted-foreground text-center leading-tight px-0.5", className)}>
        {champion.name.slice(0, 7)}
      </div>
    );
  }

  return (
    <img
      src={imgState === "primary" ? champion.iconUrl : champion.fallbackIconUrl}
      alt={champion.name}
      className={cn("object-cover", className)}
      loading="lazy"
      draggable={false}
      onError={() => {
        if (imgState === "primary" && champion.fallbackIconUrl) {
          setImgState("fallback");
        } else {
          setImgState("failed");
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Draggable champion tile — Image 5 inspired design
// dnd-kit id: "champion:<apiName>"
// ---------------------------------------------------------------------------

function DraggableChampionTile({
  champion,
  isOccupied,
}: {
  champion: TFTChampion;
  isOccupied: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `champion:${champion.apiName}`,
    disabled: isOccupied,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      title={`${champion.name}${isOccupied ? " (on board)" : ""}`}
      className={cn(
        "group flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing select-none transition-all duration-100",
        isOccupied && "opacity-35 cursor-default pointer-events-none",
        isDragging && "opacity-40"
      )}
    >
      {/* Portrait with cost ring */}
      <div
        className={cn(
          "w-12 h-12 rounded-lg overflow-hidden transition-all duration-150",
          COST_RING[champion.cost] ?? COST_RING[1],
          !isOccupied && "group-hover:scale-110 group-hover:brightness-110"
        )}
      >
        <ChampionImg champion={champion} className="w-full h-full" />
      </div>
      {/* Name */}
      <span
        className={cn(
          "text-[9px] leading-none text-center truncate w-14",
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
// Drag overlay champion preview
// ---------------------------------------------------------------------------

function DragOverlayContent({ champion }: { champion: TFTChampion }) {
  return (
    <div className="flex flex-col items-center gap-1 select-none pointer-events-none rotate-2">
      <div
        className={cn(
          "w-12 h-12 rounded-lg overflow-hidden shadow-2xl",
          COST_RING[champion.cost] ?? COST_RING[1]
        )}
      >
        <ChampionImg champion={champion} className="w-full h-full" />
      </div>
      <span
        className={cn(
          "text-[9px] leading-none text-center",
          COST_NAME_COLOR[champion.cost] ?? "text-muted-foreground"
        )}
      >
        {champion.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Champion sort — by cost asc, special units (non-Set17) always last
// ---------------------------------------------------------------------------

function sortChampions(champions: TFTChampion[]): TFTChampion[] {
  const isSpecial = (c: TFTChampion) =>
    !c.apiName.startsWith("TFT17_") || c.cost === 0;

  return [...champions].sort((a, b) => {
    const aS = isSpecial(a);
    const bS = isSpecial(b);
    if (aS !== bS) return aS ? 1 : -1;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Champion picker panel — search only, no cost filters
// ---------------------------------------------------------------------------

function ChampionPanel({ occupiedKeys }: { occupiedKeys: string[] }) {
  const [search, setSearch] = useState("");
  const { champions } = useTFTData();

  const sorted = useMemo(() => sortChampions(champions), [champions]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [sorted, search]);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Header + search */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
          Champions
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

      {/* Champion grid */}
      <div
        className={cn(
          "flex flex-wrap gap-x-2 gap-y-3 overflow-y-auto pr-1",
          // Minimal scrollbar
          "[&::-webkit-scrollbar]:w-1",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-white/10",
          "hover:[&::-webkit-scrollbar-thumb]:bg-white/20"
        )}
        style={{ maxHeight: "232px" }}
      >
        {filtered.map((champion) => (
          <DraggableChampionTile
            key={champion.apiName}
            champion={champion}
            isOccupied={occupiedKeys.includes(champion.apiName)}
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
  const { championMap, setNumber } = useTFTData();

  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // -------------------------------------------------------------------------
  // Drag handlers
  // -------------------------------------------------------------------------

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(String(active.id));
    setSelectedPos(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (!overId.startsWith("hex:")) return;

    const targetPos = parseInt(overId.replace("hex:", ""), 10);

    if (activeId.startsWith("champion:")) {
      placeChampion(activeId.replace("champion:", ""), targetPos);
    } else if (activeId.startsWith("hex:")) {
      moveOrSwap(parseInt(activeId.replace("hex:", ""), 10), targetPos);
    }
  }

  function handleDragCancel() {
    setActiveDragId(null);
  }

  // -------------------------------------------------------------------------
  // Board mutation
  // -------------------------------------------------------------------------

  function placeChampion(apiName: string, targetPos: number) {
    if (step.units.some((u) => u.position === targetPos)) return;
    if (step.units.some((u) => u.championKey === apiName)) {
      const champ = championMap.get(apiName);
      toast.error(`${champ?.name ?? apiName} is already on the board`);
      return;
    }
    const newUnit: BoardUnit = {
      id: crypto.randomUUID(),
      championKey: apiName,
      position: targetPos,
      items: [],
      starLevel: 1,
      isCarry: false,
      isItemHolder: false,
    };
    onUpdate(step.id, { units: [...step.units, newUnit] });
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

  function handleRemoveUnit(pos: number) {
    onUpdate(step.id, { units: step.units.filter((u) => u.position !== pos) });
    setSelectedPos(null);
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
  // Overlay champion
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

  const isDraggingFromPanel = !!(activeDragId?.startsWith("champion:"));

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
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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

        {/* Action buttons — stop propagation so they don't toggle expand */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-foreground"
            onClick={() => onDuplicate(step.id)}
            title="Duplicate step"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive/60 hover:text-destructive"
                title="Delete step"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{step.title}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This board step will be removed permanently after saving.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRemove(step.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ── Expanded editor ─────────────────────────────────────────────────── */}
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
                max={11}
                value={step.level}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 11) onUpdate(step.id, { level: val });
                }}
                className="h-8 text-sm bg-background/60"
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
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => onUpdate(step.id, { description })}
              placeholder="When to roll, when to level, who holds items…"
              className="text-sm resize-none bg-background/60"
            />
          </div>

          {/* Board + panels in DnD context */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {/* Board */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Board <span className="text-muted-foreground/50">({unitCount}/28)</span>
                </Label>
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
                  onRemove={handleRemoveUnit}
                  onCancelSelection={() => setSelectedPos(null)}
                  isDraggingFromPanel={isDraggingFromPanel}
                />
              </div>
            </div>

            {/* Two-column panel: Champions | Items */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1 border-t border-border/40">
              <div className="bg-background/30 rounded-xl p-3 border border-white/5">
                <ChampionPanel
                  occupiedKeys={step.units.map((u) => u.championKey)}
                />
              </div>
              <div className="bg-background/30 rounded-xl p-3 border border-white/5">
                <ItemsPanel />
              </div>
            </div>

            {/* Drag overlay */}
            <DragOverlay dropAnimation={null}>
              {overlayChampion && <DragOverlayContent champion={overlayChampion} />}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}
