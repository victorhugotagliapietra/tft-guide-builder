import { useState } from "react";
import { X, MoveRight } from "lucide-react";
import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import { COST_COLORS } from "@/features/tft-data/mock-champions";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTChampion } from "@/features/tft-data/types";
import type { BoardUnit } from "./types";
import { ChampionPicker } from "./ChampionPicker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  units: BoardUnit[];
  onAddUnit: (position: number, champion: TFTChampion) => void;
  onMoveUnit: (fromPos: number, toPos: number) => void;
  onRemoveUnit: (position: number) => void;
};

export function BoardGrid({ units, onAddUnit, onMoveUnit, onRemoveUnit }: Props) {
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerHex, setPickerHex] = useState<number | null>(null);
  const { championMap } = useTFTData();

  const unitMap = new Map(units.map((u) => [u.position, u]));
  const occupiedKeys = units.map((u) => u.championKey);

  function handleHexClick(pos: number) {
    const unit = unitMap.get(pos);

    if (selectedPos !== null) {
      if (pos === selectedPos) {
        setSelectedPos(null);
        return;
      }
      if (unit) {
        setSelectedPos(pos);
        return;
      }
      onMoveUnit(selectedPos, pos);
      setSelectedPos(null);
      return;
    }

    if (unit) {
      setSelectedPos(pos);
    } else {
      setPickerHex(pos);
      setPickerOpen(true);
    }
  }

  function handleChampionSelect(champion: TFTChampion) {
    if (pickerHex !== null) {
      onAddUnit(pickerHex, champion);
    }
    setPickerOpen(false);
    setPickerHex(null);
  }

  const selectedUnit = selectedPos !== null ? unitMap.get(selectedPos) : undefined;
  const selectedChampion = selectedUnit
    ? championMap.get(selectedUnit.championKey)
    : undefined;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {Array.from({ length: BOARD_ROWS }, (_, row) => (
          <div key={row} className="flex gap-1">
            {Array.from({ length: BOARD_COLS }, (_, col) => {
              const pos = coordsToPosition(row, col);
              const unit = unitMap.get(pos);
              const champion = unit ? championMap.get(unit.championKey) : undefined;
              const colors = champion ? COST_COLORS[champion.cost] ?? COST_COLORS[1] : null;
              const isSelected = selectedPos === pos;
              const isMoveTarget = selectedPos !== null && !unit;

              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => handleHexClick(pos)}
                  className={cn(
                    "w-12 h-12 rounded-md border text-[10px] font-medium flex flex-col items-center justify-center transition-all select-none shrink-0",
                    unit
                      ? [colors?.bg, colors?.text, "border-transparent"]
                      : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/60",
                    isSelected && "ring-2 ring-offset-1 ring-primary ring-offset-background scale-105",
                    isMoveTarget && "border-dashed border-primary/60 hover:bg-primary/10"
                  )}
                  title={champion ? champion.name : `Hex ${pos}`}
                >
                  {champion ? (
                    <>
                      {champion.iconUrl ? (
                        <img
                          src={champion.iconUrl}
                          alt={champion.name}
                          className="w-8 h-8 rounded object-cover"
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <span className="truncate w-full text-center px-0.5 leading-tight text-[10px]">
                          {champion.name.length > 6
                            ? champion.name.slice(0, 6)
                            : champion.name}
                        </span>
                      )}
                      <span className="opacity-60 text-[9px]">{champion.cost}★</span>
                    </>
                  ) : (
                    <span className="opacity-30 text-[8px]">{pos}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Status bar when a unit is selected */}
      {selectedUnit && selectedChampion && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm">
          <MoveRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground flex-1">
            <span className="font-medium text-foreground">{selectedChampion.name}</span>
            {" "}selected — click an empty hex to move
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-6 px-2 text-xs"
            onClick={() => {
              onRemoveUnit(selectedPos!);
              setSelectedPos(null);
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Remove
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setSelectedPos(null)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Empty board hint */}
      {units.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Click any hex to add a champion.
        </p>
      )}

      <ChampionPicker
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setPickerHex(null);
        }}
        onSelect={handleChampionSelect}
        occupiedKeys={occupiedKeys}
      />
    </div>
  );
}
