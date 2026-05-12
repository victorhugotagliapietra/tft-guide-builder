import { useState } from "react";
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
const ROW_PITCH = Math.round(HEX_H * 0.75); // 56px — rows overlap by 25%
const GAP = 3;
const CELL_W = HEX_W - GAP;
const CELL_H = HEX_H - GAP;
const CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export const HEX_CONTAINER_W = BOARD_COLS * HEX_W + HEX_W / 2; // 480
export const HEX_CONTAINER_H = (BOARD_ROWS - 1) * ROW_PITCH + HEX_H; // 242

// ---------------------------------------------------------------------------
// Sub-component: single champion display (owns img-failed state)
// ---------------------------------------------------------------------------

function ChampionDisplay({
  champion,
  starLevel,
}: {
  champion: TFTChampion;
  starLevel: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <>
      {champion.iconUrl && !imgFailed ? (
        <img
          src={champion.iconUrl}
          alt={champion.name}
          className="w-9 h-9 object-cover"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-[8px] leading-tight text-center px-0.5 truncate w-full">
          {champion.name.slice(0, 7)}
        </span>
      )}
      <span className="text-[8px] opacity-60 leading-none mt-0.5">{starLevel}★</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  units: BoardUnit[];
  selectedPos: number | null;         // hex selected for MOVING
  pendingChampion: TFTChampion | null; // champion waiting to be placed
  onHexClick: (pos: number) => void;
  onRemove: (pos: number) => void;
  onCancel: () => void;
};

// ---------------------------------------------------------------------------
// BoardGrid
// ---------------------------------------------------------------------------

export function BoardGrid({
  units,
  selectedPos,
  pendingChampion,
  onHexClick,
  onRemove,
  onCancel,
}: Props) {
  const { championMap } = useTFTData();
  const unitMap = new Map(units.map((u) => [u.position, u]));

  const selectedUnit = selectedPos !== null ? unitMap.get(selectedPos) : undefined;
  const selectedChampion = selectedUnit
    ? championMap.get(selectedUnit.championKey)
    : undefined;

  return (
    <div className="space-y-2">
      {/* Hex grid */}
      <div
        className="relative"
        style={{ width: HEX_CONTAINER_W, height: HEX_CONTAINER_H }}
      >
        {Array.from({ length: BOARD_ROWS }, (_, row) =>
          Array.from({ length: BOARD_COLS }, (_, col) => {
            const pos = coordsToPosition(row, col);
            const unit = unitMap.get(pos);
            const champion = unit ? championMap.get(unit.championKey) : undefined;
            const colors = champion
              ? (COST_COLORS[champion.cost] ?? COST_COLORS[1])
              : null;

            const isSelected = selectedPos === pos;
            const isMovingTarget = selectedPos !== null && !unit && !pendingChampion;
            const isPlaceTarget = pendingChampion !== null && !unit;

            const left = col * HEX_W + (row % 2 === 1 ? HEX_W / 2 : 0) + GAP / 2;
            const top = row * ROW_PITCH + GAP / 2;

            return (
              <button
                key={pos}
                type="button"
                onClick={() => onHexClick(pos)}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width: CELL_W,
                  height: CELL_H,
                  clipPath: CLIP,
                }}
                className={cn(
                  "flex flex-col items-center justify-center transition-all select-none",
                  champion
                    ? [colors?.bg, colors?.text]
                    : "bg-muted/20 hover:bg-muted/40",
                  isSelected && "brightness-125",
                  isPlaceTarget && "bg-primary/20 hover:bg-primary/35 cursor-crosshair",
                  isMovingTarget && "hover:bg-primary/20 cursor-crosshair"
                )}
                title={
                  champion
                    ? `${champion.name} ${champion.cost}★`
                    : `Hex ${pos}`
                }
              >
                {champion ? (
                  <ChampionDisplay
                    champion={champion}
                    starLevel={unit!.starLevel}
                  />
                ) : isPlaceTarget ? (
                  <span className="text-primary/50 text-lg leading-none">+</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {/* Status bar */}
      {(selectedUnit || pendingChampion) && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm">
          {selectedUnit && selectedChampion ? (
            <span className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedChampion.name}
              </span>{" "}
              selected — click an empty hex to move
            </span>
          ) : pendingChampion ? (
            <span className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">
                {pendingChampion.name}
              </span>{" "}
              — click an empty hex to place
            </span>
          ) : null}
          {selectedUnit && (
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
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
