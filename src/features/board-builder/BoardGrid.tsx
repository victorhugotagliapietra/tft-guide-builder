import { useState } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { X } from "lucide-react";
import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import { COST_COLORS } from "@/features/tft-data/mock-champions";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTChampion } from "@/features/tft-data/types";
import type { BoardUnit } from "./types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Hex geometry
// ---------------------------------------------------------------------------

const HEX_W = 64;
const HEX_H = 74;
const ROW_PITCH = Math.round(HEX_H * 0.75); // 56px
const GAP = 3;
const CELL_W = HEX_W - GAP;
const CELL_H = HEX_H - GAP;
const CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export const HEX_CONTAINER_W = BOARD_COLS * HEX_W + HEX_W / 2; // 480
export const HEX_CONTAINER_H = (BOARD_ROWS - 1) * ROW_PITCH + HEX_H; // 242

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
  const [imgState, setImgState] = useState<"primary" | "fallback" | "failed">(
    champion.iconUrl ? "primary" : champion.fallbackIconUrl ? "fallback" : "failed"
  );

  if (imgState === "failed" || (!champion.iconUrl && !champion.fallbackIconUrl)) {
    return (
      <span className={cn("text-[8px] leading-tight text-center px-0.5 break-words", className)}>
        {champion.name.slice(0, 7)}
      </span>
    );
  }

  const src = imgState === "primary" ? champion.iconUrl : champion.fallbackIconUrl;

  return (
    <img
      src={src}
      alt={champion.name}
      className={className}
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
// Draggable unit (inside a hex that has a champion)
// dnd-kit id: "hex:<position>"
// ---------------------------------------------------------------------------

function DraggableUnit({
  pos,
  champion,
  starLevel,
  isSelected,
}: {
  pos: number;
  champion: TFTChampion;
  starLevel: number;
  isSelected: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hex:${pos}`,
  });
  const colors = COST_COLORS[champion.cost] ?? COST_COLORS[1];

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      className={cn(
        "w-full h-full flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none",
        colors.bg,
        colors.text,
        isDragging && "opacity-30",
        isSelected && "brightness-125"
      )}
    >
      <ChampionImg
        champion={champion}
        className="w-9 h-9 object-cover pointer-events-none"
      />
      <span className="text-[8px] opacity-60 leading-none mt-0.5 pointer-events-none">
        {starLevel}★
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Droppable hex cell
// dnd-kit id: "hex:<position>"
// ---------------------------------------------------------------------------

function DroppableHex({
  pos,
  left,
  top,
  isEmpty,
  isPlaceTarget,
  children,
}: {
  pos: number;
  left: number;
  top: number;
  isEmpty: boolean;
  isPlaceTarget: boolean;
  children?: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `hex:${pos}` });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        left,
        top,
        width: CELL_W,
        height: CELL_H,
        clipPath: CLIP,
      }}
      className={cn(
        "flex flex-col items-center justify-center transition-all",
        isEmpty && "bg-muted/20",
        isPlaceTarget && isEmpty && "bg-primary/20",
        isOver && isEmpty && "bg-primary/40 brightness-125",
        isOver && !isEmpty && "brightness-150"
      )}
      title={isEmpty ? `Hex ${pos}` : undefined}
    >
      {children}
      {isEmpty && isOver && (
        <span className="text-primary/70 text-xl leading-none pointer-events-none">+</span>
      )}
      {isEmpty && !isOver && isPlaceTarget && (
        <span className="text-primary/40 text-xl leading-none pointer-events-none">+</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  units: BoardUnit[];
  selectedPos: number | null;
  onHexClick: (pos: number) => void;
  onRemove: (pos: number) => void;
  onCancelSelection: () => void;
  /** True while any champion tile in the picker is being dragged */
  isDraggingFromPanel: boolean;
};

// ---------------------------------------------------------------------------
// BoardGrid
// ---------------------------------------------------------------------------

export function BoardGrid({
  units,
  selectedPos,
  onHexClick,
  onRemove,
  onCancelSelection,
  isDraggingFromPanel,
}: Props) {
  const { championMap } = useTFTData();
  const unitMap = new Map(units.map((u) => [u.position, u]));

  const selectedUnit = selectedPos !== null ? unitMap.get(selectedPos) : undefined;
  const selectedChampion = selectedUnit
    ? championMap.get(selectedUnit.championKey)
    : undefined;

  return (
    <div className="space-y-2">
      <div
        className="relative"
        style={{ width: HEX_CONTAINER_W, height: HEX_CONTAINER_H }}
      >
        {Array.from({ length: BOARD_ROWS }, (_, row) =>
          Array.from({ length: BOARD_COLS }, (_, col) => {
            const pos = coordsToPosition(row, col);
            const unit = unitMap.get(pos);
            const champion = unit ? championMap.get(unit.championKey) : undefined;

            const left = col * HEX_W + (row % 2 === 1 ? HEX_W / 2 : 0) + GAP / 2;
            const top = row * ROW_PITCH + GAP / 2;
            const isEmpty = !unit;

            return (
              <DroppableHex
                key={pos}
                pos={pos}
                left={left}
                top={top}
                isEmpty={isEmpty}
                isPlaceTarget={isDraggingFromPanel}
              >
                {champion && unit ? (
                  // Clicking an occupied hex selects it (for removal via status bar)
                  <div
                    className="w-full h-full"
                    onClick={() => onHexClick(pos)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onHexClick(pos)}
                    aria-label={`${champion.name} — click to select`}
                  >
                    <DraggableUnit
                      pos={pos}
                      champion={champion}
                      starLevel={unit.starLevel}
                      isSelected={selectedPos === pos}
                    />
                  </div>
                ) : null}
              </DroppableHex>
            );
          })
        )}
      </div>

      {/* Status bar when a unit is selected */}
      {selectedUnit && selectedChampion && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm">
          <span className="flex-1 text-muted-foreground">
            <span className="font-medium text-foreground">{selectedChampion.name}</span>{" "}
            selected
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-6 px-2 text-xs"
            onClick={() => onRemove(selectedPos!)}
          >
            <X className="h-3 w-3 mr-1" />
            Remove
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={onCancelSelection}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
