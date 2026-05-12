import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Link,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import { generatePlannerCode } from "@/features/tft-data/planner-code";
import { COST_COLORS } from "@/features/tft-data/mock-champions";
import type { TFTChampion } from "@/features/tft-data/types";
import {
  STEP_TYPES,
  STEP_TYPE_LABELS,
  type BoardStep,
  type BoardUnit,
} from "./types";
import { BoardGrid } from "./BoardGrid";
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
// Champion tile (owns img-failed state)
// ---------------------------------------------------------------------------

function ChampionTile({
  champion,
  isOccupied,
  isPending,
  onSelect,
}: {
  champion: TFTChampion;
  isOccupied: boolean;
  isPending: boolean;
  onSelect: (c: TFTChampion) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const colors = COST_COLORS[champion.cost] ?? COST_COLORS[1];

  return (
    <button
      type="button"
      onClick={() => onSelect(champion)}
      title={champion.name}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-md p-1 text-[10px] font-medium transition-all w-14",
        colors.bg,
        colors.text,
        isOccupied && "opacity-30 cursor-not-allowed",
        isPending && "ring-2 ring-white scale-105 brightness-110"
      )}
    >
      {champion.iconUrl && !imgFailed ? (
        <img
          src={champion.iconUrl}
          alt={champion.name}
          className="w-10 h-10 rounded object-cover"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className={cn(
            "w-10 h-10 rounded flex items-center justify-center text-[8px] text-center leading-tight px-0.5",
            colors.bg
          )}
        >
          {champion.name.slice(0, 8)}
        </div>
      )}
      <span className="truncate w-full text-center leading-tight">
        {champion.name.slice(0, 9)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline champion panel
// ---------------------------------------------------------------------------

const COST_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

function ChampionPanel({
  occupiedKeys,
  pendingKey,
  onSelect,
}: {
  occupiedKeys: string[];
  pendingKey: string | null;
  onSelect: (c: TFTChampion) => void;
}) {
  const [search, setSearch] = useState("");
  const [costFilter, setCostFilter] = useState<number | null>(null);
  const { champions } = useTFTData();

  const filtered = useMemo(
    () =>
      champions.filter((c) => {
        const matchesCost = costFilter === null || c.cost === costFilter;
        const matchesSearch =
          !search ||
          c.name.toLowerCase().includes(search.trim().toLowerCase());
        return matchesCost && matchesSearch;
      }),
    [champions, search, costFilter]
  );

  return (
    <div className="space-y-2">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground shrink-0">
          Units
        </span>
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setCostFilter(null)}
            className={cn(
              "h-6 px-2 rounded text-[10px] font-medium border transition-opacity",
              costFilter === null
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-border text-muted-foreground hover:bg-muted/50"
            )}
          >
            All
          </button>
          {COST_OPTIONS.map((cost) => {
            const colors = COST_COLORS[cost] ?? COST_COLORS[1];
            return (
              <button
                key={cost}
                type="button"
                onClick={() =>
                  setCostFilter(costFilter === cost ? null : cost)
                }
                className={cn(
                  "h-6 px-2 rounded text-[10px] font-bold border-transparent transition-opacity",
                  colors.bg,
                  colors.text,
                  costFilter !== null && costFilter !== cost && "opacity-30"
                )}
              >
                {cost === 0 ? "0" : `${cost}★`}
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 pl-6 pr-2 text-xs w-28"
          />
        </div>
      </div>

      {/* Champion grid */}
      <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto pr-1">
        {filtered.map((champion) => (
          <ChampionTile
            key={champion.apiName}
            champion={champion}
            isOccupied={
              occupiedKeys.includes(champion.apiName) &&
              pendingKey !== champion.apiName
            }
            isPending={pendingKey === champion.apiName}
            onSelect={onSelect}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground py-3 w-full text-center">
            No champions found
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BoardStepCard props
// ---------------------------------------------------------------------------

type Props = {
  step: BoardStep;
  isFirst: boolean;
  isLast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: string, patch: Partial<BoardStep>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
};

// ---------------------------------------------------------------------------
// BoardStepCard
// ---------------------------------------------------------------------------

export function BoardStepCard({
  step,
  isFirst,
  isLast,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: Props) {
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description);
  const { championMap, setNumber } = useTFTData();

  // Board interaction state
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [pendingChampion, setPendingChampion] = useState<TFTChampion | null>(null);

  // -------------------------------------------------------------------------
  // Board interaction handlers
  // -------------------------------------------------------------------------

  function handleHexClick(pos: number) {
    const unit = step.units.find((u) => u.position === pos);

    // Placing mode
    if (pendingChampion) {
      if (!unit) {
        const alreadyOnBoard = step.units.find(
          (u) => u.championKey === pendingChampion.apiName
        );
        if (alreadyOnBoard) {
          toast.error(`${pendingChampion.name} is already on the board`);
          return;
        }
        const newUnit: BoardUnit = {
          id: crypto.randomUUID(),
          championKey: pendingChampion.apiName,
          position: pos,
          items: [],
          starLevel: 1,
          isCarry: false,
          isItemHolder: false,
        };
        onUpdate(step.id, { units: [...step.units, newUnit] });
        setPendingChampion(null);
      }
      return;
    }

    // Moving mode
    if (selectedPos !== null) {
      if (pos === selectedPos) {
        setSelectedPos(null);
        return;
      }
      if (unit) {
        setSelectedPos(pos);
        return;
      }
      onUpdate(step.id, {
        units: step.units.map((u) =>
          u.position === selectedPos ? { ...u, position: pos } : u
        ),
      });
      setSelectedPos(null);
      return;
    }

    // Idle mode
    if (unit) setSelectedPos(pos);
  }

  function handleChampionSelect(champion: TFTChampion) {
    if (pendingChampion?.apiName === champion.apiName) {
      setPendingChampion(null);
      return;
    }
    setPendingChampion(champion);
    setSelectedPos(null);
  }

  function handleRemoveUnit(pos: number) {
    onUpdate(step.id, {
      units: step.units.filter((u) => u.position !== pos),
    });
    setSelectedPos(null);
  }

  function handleCancel() {
    setSelectedPos(null);
    setPendingChampion(null);
  }

  function handleCopyPlannerCode() {
    const result = generatePlannerCode(step.units, setNumber);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    navigator.clipboard.writeText(result.code).then(
      () => toast.success("Planner code copied!"),
      () => toast.error("Failed to write to clipboard.")
    );
  }

  // -------------------------------------------------------------------------
  // Collapsed header summary
  // -------------------------------------------------------------------------

  const unitCount = step.units.length;
  const championNames = step.units
    .slice(0, 3)
    .map((u) => championMap.get(u.championKey)?.name ?? u.championKey)
    .join(", ");

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 bg-card cursor-pointer select-none hover:bg-muted/30 transition-colors",
          isExpanded && "border-b border-border"
        )}
        onClick={onToggleExpand}
      >
        <button type="button" className="shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{step.title}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {STEP_TYPE_LABELS[step.stepType]}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0">
              Lv{step.level}
            </span>
          </div>
          {!isExpanded && unitCount > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {unitCount} unit{unitCount !== 1 ? "s" : ""}
              {championNames
                ? ` — ${championNames}${unitCount > 3 ? "…" : ""}`
                : ""}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={isFirst}
            onClick={() => onMoveUp(step.id)}
            title="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={isLast}
            onClick={() => onMoveDown(step.id)}
            title="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onDuplicate(step.id)}
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                title="Delete"
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
                <AlertDialogAction onClick={() => onRemove(step.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-card">
          {/* Metadata row */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() =>
                  onUpdate(step.id, { title: title.trim() || "New board" })
                }
                placeholder="e.g. Level 6 stabilize"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Level</Label>
              <Input
                type="number"
                min={1}
                max={11}
                value={step.level}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 11) {
                    onUpdate(step.id, { level: val });
                  }
                }}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select
                value={step.stepType}
                onValueChange={(val) =>
                  onUpdate(step.id, {
                    stepType: val as BoardStep["stepType"],
                  })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {STEP_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => onUpdate(step.id, { description })}
              placeholder="When to roll, when to level, who holds items…"
              className="text-sm resize-none"
            />
          </div>

          {/* Board grid */}
          <div className="space-y-1.5 overflow-x-auto">
            <Label className="text-xs">Board ({unitCount}/28 units)</Label>
            <BoardGrid
              units={step.units}
              selectedPos={selectedPos}
              pendingChampion={pendingChampion}
              onHexClick={handleHexClick}
              onRemove={handleRemoveUnit}
              onCancel={handleCancel}
            />
          </div>

          {/* Champion picker panel */}
          <div className="border-t border-border/50 pt-3">
            <ChampionPanel
              occupiedKeys={step.units.map((u) => u.championKey)}
              pendingKey={pendingChampion?.apiName ?? null}
              onSelect={handleChampionSelect}
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-1 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={unitCount === 0}
              onClick={handleCopyPlannerCode}
              title={
                unitCount === 0
                  ? "Add champions to generate a planner code"
                  : "Copy planner code to clipboard"
              }
            >
              <Link className="h-3.5 w-3.5" />
              Copy planner code
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
