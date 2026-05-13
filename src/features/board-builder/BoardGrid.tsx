import { useState } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { Star } from "lucide-react";
import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTChampion } from "@/features/tft-data/types";
import type { BoardUnit } from "./types";
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

export const HEX_CONTAINER_W = BOARD_COLS * HEX_W + HEX_W / 2;
export const HEX_CONTAINER_H = (BOARD_ROWS - 1) * ROW_PITCH + HEX_H;

const COST_HEX_BORDER: Record<number, string> = {
  0: "bg-zinc-500",
  1: "bg-slate-400",
  2: "bg-green-500",
  3: "bg-blue-500",
  4: "bg-purple-500",
  5: "bg-yellow-400",
};

// ---------------------------------------------------------------------------
// Champion image fallback
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
      <div className={cn("flex items-center justify-center bg-muted/40 text-[9px] text-muted-foreground text-center leading-tight px-0.5", className)}>
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
        if (imgState === "primary" && champion.fallbackIconUrl) setImgState("fallback");
        else setImgState("failed");
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Star control — hover-visible, click to set
// ---------------------------------------------------------------------------

function StarControl({
  starLevel,
  onSet,
}: {
  starLevel: number;
  onSet: (level: number) => void;
}) {
  // Note: parent has `group/hex` class so we can use group-hover/hex utilities
  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 flex gap-px pointer-events-none">
      {[1, 2, 3].map((level) => {
        const isFilled = level <= starLevel;
        const isGold = starLevel === 3;
        return (
          <button
            key={level}
            type="button"
            // Stop pointer events from bubbling to the draggable hex
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              // Clicking an already-active star clears down to one less
              onSet(starLevel === level ? level - 1 : level);
            }}
            className={cn(
              "pointer-events-auto p-0.5 transition-opacity duration-150 leading-none",
              isFilled
                ? "opacity-100"
                : "opacity-0 group-hover/hex:opacity-100",
              isFilled && isGold && "text-yellow-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]",
              isFilled && !isGold && "text-slate-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]",
              !isFilled && "text-white/40 hover:text-white"
            )}
            aria-label={`Set star level ${level}`}
          >
            <Star
              size={11}
              strokeWidth={1.5}
              fill={isFilled ? "currentColor" : "none"}
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draggable unit (the champion image inside an occupied hex)
// ---------------------------------------------------------------------------

function DraggableUnit({
  pos,
  champion,
  isSelected,
}: {
  pos: number;
  champion: TFTChampion;
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
      {/* Cost-color border hex */}
      <div
        className={cn("absolute inset-0", COST_HEX_BORDER[champion.cost] ?? COST_HEX_BORDER[1])}
        style={{ clipPath: CLIP }}
      />
      {/* Inset image hex */}
      <div className="absolute" style={{ inset: 2, clipPath: CLIP }}>
        <ChampionImg champion={champion} className="w-full h-full pointer-events-none" />
      </div>
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
      style={{ position: "absolute", left, top, width: CELL_W, height: CELL_H }}
      className="relative group/hex"
    >
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
  onSetStarLevel: (pos: number, level: number) => void;
  isDraggingFromPanel: boolean;
};

// ---------------------------------------------------------------------------
// BoardGrid
// ---------------------------------------------------------------------------

export function BoardGrid({
  units,
  selectedPos,
  onHexClick,
  onSetStarLevel,
  isDraggingFromPanel,
}: Props) {
  const { championMap } = useTFTData();
  const unitMap = new Map(units.map((u) => [u.position, u]));

  return (
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
                <>
                  <div
                    className="absolute inset-0"
                    onClick={() => onHexClick(pos)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${champion.name} ${unit.starLevel}★`}
                  >
                    <DraggableUnit
                      pos={pos}
                      champion={champion}
                      isSelected={selectedPos === pos}
                    />
                  </div>
                  <StarControl
                    starLevel={unit.starLevel}
                    onSet={(level) => onSetStarLevel(pos, level)}
                  />
                </>
              ) : null}
            </DroppableHex>
          );
        })
      )}
    </div>
  );
}
