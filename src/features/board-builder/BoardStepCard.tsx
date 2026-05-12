import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Trash2, ArrowUp, ArrowDown, Link } from "lucide-react";
import { toast } from "sonner";
import type { TFTChampion } from "@/features/tft-data/types";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import { generatePlannerCode } from "@/features/tft-data/planner-code";
import { STEP_TYPES, STEP_TYPE_LABELS, type BoardStep, type BoardUnit } from "./types";
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

  function handleAddUnit(position: number, champion: TFTChampion) {
    const alreadyHere = step.units.find((u) => u.position === position);
    if (alreadyHere) return;
    const alreadyOnBoard = step.units.find((u) => u.championKey === champion.apiName);
    if (alreadyOnBoard) return;
    const newUnit: BoardUnit = {
      id: crypto.randomUUID(),
      championKey: champion.apiName,
      position,
      items: [],
      starLevel: 1,
      isCarry: false,
      isItemHolder: false,
    };
    onUpdate(step.id, { units: [...step.units, newUnit] });
  }

  function handleMoveUnit(fromPos: number, toPos: number) {
    onUpdate(step.id, {
      units: step.units.map((u) =>
        u.position === fromPos ? { ...u, position: toPos } : u
      ),
    });
  }

  function handleRemoveUnit(position: number) {
    onUpdate(step.id, {
      units: step.units.filter((u) => u.position !== position),
    });
  }

  const unitCount = step.units.length;
  const championNames = step.units
    .slice(0, 3)
    .map((u) => championMap.get(u.championKey)?.name ?? u.championKey)
    .join(", ");

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
            <span className="text-xs text-muted-foreground shrink-0">Lv{step.level}</span>
          </div>
          {!isExpanded && unitCount > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {unitCount} unit{unitCount !== 1 ? "s" : ""}
              {championNames ? ` — ${championNames}${unitCount > 3 ? "..." : ""}` : ""}
            </p>
          )}
        </div>

        {/* Action buttons — stop propagation so they don't toggle the card */}
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
          {/* Step metadata */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => onUpdate(step.id, { title: title.trim() || "New board" })}
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
                  onUpdate(step.id, { stepType: val as BoardStep["stepType"] })
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
              placeholder="When to roll, when to level, who holds items..."
              className="text-sm resize-none"
            />
          </div>

          {/* Board grid */}
          <div className="space-y-1.5">
            <Label className="text-xs">Board ({unitCount}/28 units)</Label>
            <BoardGrid
              units={step.units}
              onAddUnit={handleAddUnit}
              onMoveUnit={handleMoveUnit}
              onRemoveUnit={handleRemoveUnit}
            />
          </div>

          {/* Planner code */}
          <div className="flex justify-end pt-1 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={unitCount === 0}
              onClick={handleCopyPlannerCode}
              title={unitCount === 0 ? "Add champions to generate a planner code" : "Copy planner code to clipboard"}
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
