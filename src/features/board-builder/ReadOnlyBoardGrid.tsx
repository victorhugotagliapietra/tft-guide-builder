import { useState, useEffect } from "react";
import { Star } from "lucide-react";
import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import {
  useTFTData,
  TRAINING_DUMMY_API_NAME,
  TRAINING_DUMMY_LOCAL_ICON,
} from "@/features/tft-data/use-tft-data";
import type { TFTChampion } from "@/features/tft-data/types";
import type { BoardUnit } from "./types";
import { cn } from "@/lib/utils";

// Match BoardGrid geometry (keep these in sync — author and viewer must see
// the same hex positions/spacing for a guide to render identically).
const HEX_W = 104;
const HEX_H = 120;
const ROW_PITCH = Math.round(HEX_H * 0.75);
const GAP = 6;
const CELL_W = HEX_W - GAP;
const CELL_H = HEX_H - GAP;
const CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
const EMPTY_HEX_BORDER = "bg-white/[0.07]";

const CONTAINER_W = BOARD_COLS * HEX_W + HEX_W / 2;
const CONTAINER_H = (BOARD_ROWS - 1) * ROW_PITCH + HEX_H + 20;

const COST_HEX_BORDER: Record<number, string> = {
  0: "bg-zinc-500",
  1: "bg-slate-400",
  2: "bg-green-500",
  3: "bg-blue-500",
  4: "bg-purple-500",
  5: "bg-yellow-400",
};

function ChampionImg({
  champion,
  className,
}: {
  champion: TFTChampion;
  className?: string;
}) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [champion.iconUrl, champion.fallbackIconUrl]);

  // Training Dummy short-circuit — see BoardStepCard.ChampionImg for rationale.
  if (champion.apiName === TRAINING_DUMMY_API_NAME) {
    return (
      <img
        src={TRAINING_DUMMY_LOCAL_ICON}
        alt={champion.name}
        className={cn("object-cover", className)}
        loading="lazy"
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
      src={src}
      alt={champion.name}
      className={cn("object-cover", className)}
      loading="lazy"
      onError={() => {
        if (!primaryFailed && src === champion.iconUrl) {
          setPrimaryFailed(true);
        } else {
          setFallbackFailed(true);
        }
      }}
    />
  );
}

// Item icons anchored INSIDE the bottom of the hex (not below). Kept in sync
// with BoardGrid's editable version — same sizing + position so guides render
// identically for the author and the public viewer.
function ItemIcons({ itemKeys }: { itemKeys: string[] }) {
  const { items } = useTFTData();
  const itemMap = new Map(items.map((i) => [i.apiName, i]));

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-[2px] z-10 pointer-events-none">
      {itemKeys.slice(0, 3).map((key, i) => {
        const item = itemMap.get(key);
        return item?.iconUrl ? (
          <img
            key={i}
            src={item.iconUrl}
            alt={item.name}
            className="w-7 h-7 rounded-sm object-cover ring-1 ring-black/60 shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
            title={item.name}
            loading="lazy"
          />
        ) : (
          <div key={i} className="w-7 h-7 rounded-sm bg-black/40" />
        );
      })}
    </div>
  );
}

type Props = {
  units: BoardUnit[];
};

export function ReadOnlyBoardGrid({ units }: Props) {
  const { championMap } = useTFTData();
  const unitMap = new Map(units.map((u) => [u.position, u]));

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="relative"
        style={{ width: CONTAINER_W, height: CONTAINER_H }}
      >
        {Array.from({ length: BOARD_ROWS }, (_, row) =>
          Array.from({ length: BOARD_COLS }, (_, col) => {
            const pos = coordsToPosition(row, col);
            const unit = unitMap.get(pos);
            const champion = unit ? championMap.get(unit.championKey) : undefined;

            const left = col * HEX_W + (row % 2 === 1 ? HEX_W / 2 : 0) + GAP / 2;
            const top = row * ROW_PITCH + GAP / 2;

            return (
              <div
                key={pos}
                style={{ position: "absolute", left, top, width: CELL_W, height: CELL_H }}
                className="relative"
                title={champion && unit ? `${champion.name} ${unit.starLevel}★` : undefined}
              >
                {champion && unit ? (
                  <>
                    {/* Cost-color hex border */}
                    <div
                      className={cn(
                        "absolute inset-0",
                        COST_HEX_BORDER[champion.cost] ?? COST_HEX_BORDER[1]
                      )}
                      style={{ clipPath: CLIP }}
                    />
                    {/* Champion image */}
                    <div className="absolute" style={{ inset: 2, clipPath: CLIP }}>
                      <ChampionImg champion={champion} className="w-full h-full" />
                    </div>
                    {/* Stars anchored INSIDE the top of the hex (mirrors
                        BoardGrid sizing). 0 hidden, 1-2 silver, 3 gold. */}
                    {unit.starLevel > 0 && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-0.5 pointer-events-none">
                        {Array.from({ length: unit.starLevel }).map((_, i) => (
                          <Star
                            key={i}
                            size={22}
                            strokeWidth={2}
                            fill="currentColor"
                            stroke="rgba(0,0,0,0.9)"
                            style={{ paintOrder: "stroke fill", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" }}
                            className={cn(
                              unit.starLevel === 3 ? "text-yellow-400" : "text-slate-200"
                            )}
                          />
                        ))}
                      </div>
                    )}
                    {/* Items inside the bottom of the hex */}
                    {(unit.items?.length ?? 0) > 0 && (
                      <ItemIcons itemKeys={unit.items} />
                    )}
                  </>
                ) : (
                  <>
                    {/* Subtle hex outline — see BoardGrid for the same technique. */}
                    <div
                      className={cn("absolute inset-0", EMPTY_HEX_BORDER)}
                      style={{ clipPath: CLIP }}
                    />
                    <div
                      className="absolute bg-muted/15"
                      style={{ inset: 1.5, clipPath: CLIP }}
                    />
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
