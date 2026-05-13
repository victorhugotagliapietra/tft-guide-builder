import { useState } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { X } from "lucide-react";
import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTChampion } from "@/features/tft-data/types";
import type { BoardUnit } from "./types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Hex geometry
// ---------------------------------------------------------------------------

const HEX_W = 70;
const HEX_H = 80;
const ROW_PITCH = Math.round(HEX_H * 0.75); // 60px
const GAP = 4;
const CELL_W = HEX_W - GAP;
const CELL_H = HEX_H - GAP;
const CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export const HEX_CONTAINER_W = BOARD_COLS * HEX_W + HEX_W / 2; // 525
export const HEX_CONTAINER_H = (BOARD_ROWS - 1) * ROW_PITCH + HEX_H; // 260

// Cost-tier colors used as hex "border" fill — matches the outside card rings
const COST_HEX_BORDER: Record<number, string> = {
  0: "bg-zinc-500",
  1: "bg-slate-400",
  2: "bg-green-500",
  3: "bg-blue-500",
  4: "bg-purple-500",
  5: "bg-yellow-400",
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
  const [imgState, setImgState] = useState<"primary" | "fallback" | "failed">(
    champion.iconUrl ? "primary" : champion.fallbackIconUrl ? "fallback" : "failed"
  );

  if (imgState === "failed" || (!champion.iconUrl && !champion.fallbackIconUrl)) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/40 text-[9px] text-muted-foreground text-center leading-tight px-0.5",
          className
        )}
      >
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
// Draggable unit — fills the hex, cost border, star overlay
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

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      className={cn(
        "absolute inset-0 cursor-grab active:cursor-grabbing select-none",
        isDragging && "opacity-30"
      )}
    >
      {/* Cost-color hex (acts as 2px border around the image) */}
      <div
        className={cn(
          "absolute inset-0",
          COST_HEX_BORDER[champion.cost] ?? COST_HEX_BORDER[1]
        )}
        style={{ clipPath: CLIP }}
      />

      {/* Champion image — inset by 2px so the cost color shows as a border */}
      <div
        className="absolute"
        style={{ inset: 2, clipPath: CLIP }}
      >
        <ChampionImg
          champion={champion}
          className="w-full h-full pointer-events-none"
        />
      </div>

      {/* Star level badge */}
      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white drop-shadow z-10 pointer-events-none px-1.5 rounded bg-black/55 leading-tight">
        {starLevel}★
      </span>

      {/* Selection ring */}
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            clipPath: CLIP,
            boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.85)",
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Droppable hex
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
      }}
      className="relative"
    >
      {/* Empty hex background */}
      {isEmpty && (
        <div
          className={cn(
            "absolute inset-0 transition-colors",
            "bg-muted/12",
            isPlaceTarget && "bg-primary/15",
            isOver && "bg-primary/30"
          )}
          style={{ clipPath: CLIP }}
        />
      )}

      {children}

      {isEmpty && isOver && (
        <div className="absolute inset-0 flex items-center justify-center text-primary/70 text-xl pointer-events-none">
          +
        </div>
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
