import { memo, useEffect, useMemo, useState } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { Star, X } from "lucide-react";
import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import {
  useTFTData,
  TRAINING_DUMMY_API_NAME,
  TRAINING_DUMMY_LOCAL_ICON,
} from "@/features/tft-data/use-tft-data";
import type { TFTChampion, TFTItem } from "@/features/tft-data/types";
import type { BoardUnit } from "./types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Hex geometry
// ---------------------------------------------------------------------------

// Hex geometry. Bumped to 104×120 (+37% vs original 76×88) so the board
// becomes the central focus of the planner. The whole grid scales
// proportionally — drag-target rectangles, snap zones, and overlay coordinates
// all derive from these constants, so nothing downstream needs hand-tuning.
const HEX_W = 104;
const HEX_H = 120;
const ROW_PITCH = Math.round(HEX_H * 0.75); // 90px
// GAP = inter-hex spacing in pixels. CELL_W/CELL_H shrink to match so the
// hex polygon stays centered in its cell.
const GAP = 6;
const CELL_W = HEX_W - GAP;
const CELL_H = HEX_H - GAP;
const CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

// Tone used for the subtle outline around empty hexes. A separate layer painted
// at full footprint with this color is partially covered by the inset inner
// fill, leaving a hairline ring visible — gives each empty cell a defined
// edge without painting an actual stroked border (which clip-path can't do).
const EMPTY_HEX_BORDER = "bg-white/[0.07]";

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

const ChampionImg = memo(function ChampionImg({
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

  // Training Dummy short-circuit — see BoardStepCard.ChampionImg for the
  // rationale. Always renders the local /tft-data/* asset.
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
          setPrimaryFailed(true);
        } else {
          setFallbackFailed(true);
        }
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// Star control — anchored to the TOP-INSIDE of the hex. Hover-visible unless
// already set; click to assign. Stars sit just below the hex's top vertex,
// inside the polygon boundary, so the hex's footprint contains them entirely
// (no overflow into the cell above or into the BOTTOM_OVERFLOW buffer).
// ---------------------------------------------------------------------------

function StarControl({ starLevel, onSet }: { starLevel: number; onSet: (level: number) => void }) {
  // Doubled-up star size (13 → 22) plus a small horizontal gap. Pulled down
  // slightly from the very top (top-2 → top-3) because the hex polygon tapers
  // to a point at its apex — a 3-star row at 22px each needs the polygon to
  // be at least ~70px wide to sit "inside" the hex visually. Top-3 lands at
  // y≈12px, just inside the full-width band that starts at y=25%·CELL_H.
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex gap-0.5 pointer-events-none">
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
              "pointer-events-auto p-0 transition-opacity duration-150 leading-none",
              isFilled ? "opacity-100" : "opacity-0 group-hover/hex:opacity-100",
              isFilled && isGold && "text-yellow-400",
              isFilled && !isGold && "text-slate-200",
              !isFilled && "text-white/40 hover:text-white"
            )}
            aria-label={`Set star level ${level}`}
          >
            <Star
              size={22}
              strokeWidth={isFilled ? 2 : 1.5}
              stroke={isFilled ? "rgba(0,0,0,0.9)" : "currentColor"}
              fill={isFilled ? "currentColor" : "none"}
              style={isFilled ? { paintOrder: "stroke fill", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" } : undefined}
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item icons row — anchored to the BOTTOM-INSIDE of the hex.
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

// EditableItemIcons takes the item map as a prop (built once at the BoardGrid
// level) instead of calling useTFTData()+building a new Map per hex per render.
function EditableItemIcons({
  itemKeys,
  itemMap,
  onRemove,
}: {
  itemKeys: string[];
  itemMap: Map<string, TFTItem>;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-[2px] z-30 pointer-events-none">
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
              "pointer-events-auto relative w-7 h-7 rounded-sm ring-1 ring-black/60 shadow-[0_1px_3px_rgba(0,0,0,0.6)]",
              "transition-[box-shadow,filter] duration-100",
              "hover:ring-destructive/80",
              "group/item"
            )}
            aria-label={`Remove ${item?.name ?? key}`}
          >
            <ItemIconImg iconUrl={item?.iconUrl ?? ""} name={item?.name ?? key} />
            <span className="absolute inset-0 hidden group-hover/item:flex items-center justify-center bg-black/60 rounded-sm">
              <X className="w-4 h-4 text-white" strokeWidth={3} />
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
        <>
          {/* Outer hex border layer — fills the full cell footprint with a
              hairline tone. The inner fill below sits 1.5px inset, revealing
              this layer as a thin outline around the polygon. */}
          <div
            className={cn("absolute inset-0", EMPTY_HEX_BORDER)}
            style={{ clipPath: CLIP }}
          />
          {/* Inner fill — actual hex background. transition-colors animates
              the place-target / hover-over highlights. */}
          <div
            className={cn(
              "absolute transition-colors",
              "bg-muted/15",
              isPlaceTarget && "bg-primary/15",
              isOver && "bg-primary/30"
            )}
            style={{ inset: 1.5, clipPath: CLIP }}
          />
        </>
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
// BoardGrid (memoized)
// ---------------------------------------------------------------------------

function BoardGridImpl({
  units,
  selectedPos,
  onHexClick,
  onSetStarLevel,
  onRemoveItem,
  isDraggingFromPanel,
  isDraggingItem,
}: Props) {
  const { championMap, itemMap } = useTFTData();

  // Memoize the position → unit lookup so we don't allocate a fresh Map on
  // every parent re-render (which happens for every drag tick, hover, etc.).
  const unitMap = useMemo(() => {
    const m = new Map<number, BoardUnit>();
    for (const u of units) m.set(u.position, u);
    return m;
  }, [units]);

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
                      itemMap={itemMap}
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

export const BoardGrid = memo(BoardGridImpl);
