import { useState, useEffect } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { Star, X } from "lucide-react";
import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTChampion } from "@/features/tft-data/types";
import type { BoardUnit } from "./types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Hex geometry
// ---------------------------------------------------------------------------

const HEX_W = 76;
const HEX_H = 88;
const ROW_PITCH = Math.round(HEX_H * 0.75); // 66px
const GAP = 4;
const CELL_W = HEX_W - GAP;
const CELL_H = HEX_H - GAP;
const CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export const HEX_CONTAINER_W = BOARD_COLS * HEX_W + HEX_W / 2;
// Extra bottom space for item icons (absolute -bottom-3.5 = 14px) and stars (-bottom-0.5 = 2px)
const BOTTOM_OVERFLOW = 20;
export const HEX_CONTAINER_H = (BOARD_ROWS - 1) * ROW_PITCH + HEX_H + BOTTOM_OVERFLOW;

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

function ChampionImg({ champion, className }: { champion: TFTChampion; className?: string }) {
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
      <div className={cn("flex items-center justify-center bg-muted/40 text-[9px] text-muted-foreground text-center leading-tight px-0.5", className)}>
        {champion.name.slice(0, 7)}
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
// Star control — hover-visible unless already set, click to assign
// ---------------------------------------------------------------------------

function StarControl({ starLevel, onSet }: { starLevel: number; onSet: (level: number) => void }) {
  return (
    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 z-20 flex gap-px pointer-events-none">
      {[1, 2, 3].map((level) => {
        const isFilled = level <= starLevel;
        const isGold = starLevel === 3;
        return (
          <button
            key={level}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSet(starLevel === level ? level - 1 : level);
            }}
            className={cn(
              "pointer-events-auto p-0.5 transition-opacity duration-150 leading-none",
              isFilled ? "opacity-100" : "opacity-0 group-hover/hex:opacity-100",
              isFilled && isGold && "text-yellow-400",
              isFilled && !isGold && "text-slate-200",
              !isFilled && "text-white/40 hover:text-white"
            )}
            aria-label={`Set star level ${level}`}
          >
            <Star
              size={16}
              strokeWidth={isFilled ? 2 : 1.5}
              stroke={isFilled ? "rgba(0,0,0,0.8)" : "currentColor"}
              fill={isFilled ? "currentColor" : "none"}
              style={isFilled ? { paintOrder: "stroke fill" } : undefined}
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item icons row — shown below the hex, click to remove
// ---------------------------------------------------------------------------

function ItemIconImg({ iconUrl, name }: { iconUrl: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!iconUrl || failed) {
    return <div className="w-full h-full bg-muted/50 rounded-sm" />;
  }
  return (
    <img
      src={iconUrl}
      alt={name}
      className="w-full h-full object-cover rounded-sm"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function EditableItemIcons({
  itemKeys,
  onRemove,
}: {
  itemKeys: string[];
  onRemove: (index: number) => void;
}) {
  const { items } = useTFTData();
  const itemMap = new Map(items.map((i) => [i.apiName, i]));

  return (
    <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-30 pointer-events-none">
      {itemKeys.slice(0, 3).map((key, i) => {
        const item = itemMap.get(key);
        return (
          <button
            key={i}
            type="button"
            title={item?.name ?? key}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(i);
            }}
            className={cn(
              "pointer-events-auto relative w-4 h-4 rounded-sm ring-1 ring-black/40",
              "transition-all duration-100",
              "hover:scale-125 hover:ring-destructive/80 hover:z-10",
              "group/item"
            )}
            aria-label={`Remove ${item?.name ?? key}`}
          >
            <ItemIconImg iconUrl={item?.iconUrl ?? ""} name={item?.name ?? key} />
            {/* X overlay on hover */}
            <span className="absolute inset-0 hidden group-hover/item:flex items-center justify-center bg-black/60 rounded-sm">
              <X className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draggable unit
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
      <div
        className={cn("absolute inset-0", COST_HEX_BORDER[champion.cost] ?? COST_HEX_BORDER[1])}
        style={{ clipPath: CLIP }}
      />
      <div className="absolute" style={{ inset: 2, clipPath: CLIP }}>
        <ChampionImg champion={champion} className="w-full h-full pointer-events-none" />
      </div>
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ clipPath: CLIP, boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.85)" }}
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
  isDraggingItem,
  hasUnit,
  children,
}: {
  pos: number;
  left: number;
  top: number;
  isEmpty: boolean;
  isPlaceTarget: boolean;
  isDraggingItem: boolean;
  hasUnit: boolean;
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

      {/* Drop ring on occupied hex when an item is being dragged over it */}
      {hasUnit && isOver && isDraggingItem && (
        <div
          className="absolute inset-0 pointer-events-none z-20 ring-2 ring-primary/70"
          style={{ clipPath: CLIP }}
        />
      )}

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
  onRemoveItem: (pos: number, itemIndex: number) => void;
  isDraggingFromPanel: boolean;
  isDraggingItem: boolean;
};

// ---------------------------------------------------------------------------
// BoardGrid
// ---------------------------------------------------------------------------

export function BoardGrid({
  units,
  selectedPos,
  onHexClick,
  onSetStarLevel,
  onRemoveItem,
  isDraggingFromPanel,
  isDraggingItem,
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
              isDraggingItem={isDraggingItem}
              hasUnit={!!unit}
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
                  {(unit.items?.length ?? 0) > 0 && (
                    <EditableItemIcons
                      itemKeys={unit.items}
                      onRemove={(itemIndex) => onRemoveItem(pos, itemIndex)}
                    />
                  )}
                </>
              ) : null}
            </DroppableHex>
          );
        })
      )}
    </div>
  );
}
