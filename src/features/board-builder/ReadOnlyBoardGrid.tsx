import { useState } from "react";
import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import { COST_COLORS } from "@/features/tft-data/mock-champions";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTChampion } from "@/features/tft-data/types";
import type { BoardUnit } from "./types";
import { cn } from "@/lib/utils";

// Matches BoardGrid geometry
const HEX_W = 64;
const HEX_H = 74;
const ROW_PITCH = Math.round(HEX_H * 0.75);
const GAP = 3;
const CELL_W = HEX_W - GAP;
const CELL_H = HEX_H - GAP;
const CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const CONTAINER_W = BOARD_COLS * HEX_W + HEX_W / 2;
const CONTAINER_H = (BOARD_ROWS - 1) * ROW_PITCH + HEX_H;

function ChampionDisplay({
  champion,
  unit,
}: {
  champion: TFTChampion;
  unit: BoardUnit;
}) {
  const [imgState, setImgState] = useState<"primary" | "fallback" | "failed">(
    champion.iconUrl ? "primary" : champion.fallbackIconUrl ? "fallback" : "failed"
  );
  if (!champion) return null;

  const unitItems = unit.items ?? [];

  return (
    <>
      {imgState !== "failed" ? (
        <img
          src={imgState === "primary" ? champion.iconUrl : champion.fallbackIconUrl}
          alt={champion.name}
          className="w-9 h-9 object-cover"
          loading="lazy"
          onError={() => {
            if (imgState === "primary" && champion.fallbackIconUrl) {
              setImgState("fallback");
            } else {
              setImgState("failed");
            }
          }}
        />
      ) : (
        <span className="text-[8px] leading-tight text-center px-0.5 truncate w-full">
          {champion.name.slice(0, 7)}
        </span>
      )}
      <span className="text-[8px] opacity-60 leading-none mt-0.5">
        {unit.starLevel}★
      </span>
      {unitItems.length > 0 && (
        <ItemIcons itemKeys={unitItems} />
      )}
    </>
  );
}

function ItemIcons({ itemKeys }: { itemKeys: string[] }) {
  const { items } = useTFTData();
  const itemMap = new Map(items.map((i) => [i.apiName, i]));

  return (
    <div className="flex gap-0.5 justify-center mt-0.5">
      {itemKeys.slice(0, 3).map((key, i) => {
        const item = itemMap.get(key);
        return item?.iconUrl ? (
          <img
            key={i}
            src={item.iconUrl}
            alt={item.name}
            className="w-3.5 h-3.5 rounded-sm object-cover"
            title={item.name}
            loading="lazy"
          />
        ) : (
          <div key={i} className="w-3.5 h-3.5 rounded-sm bg-black/40" />
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
    <div className="overflow-x-auto pb-1">
      <div
        className="relative"
        style={{ width: CONTAINER_W, height: CONTAINER_H }}
      >
        {Array.from({ length: BOARD_ROWS }, (_, row) =>
          Array.from({ length: BOARD_COLS }, (_, col) => {
            const pos = coordsToPosition(row, col);
            const unit = unitMap.get(pos);
            const champion = unit ? championMap.get(unit.championKey) : undefined;
            const colors = champion
              ? (COST_COLORS[champion.cost] ?? COST_COLORS[1])
              : null;

            const left = col * HEX_W + (row % 2 === 1 ? HEX_W / 2 : 0) + GAP / 2;
            const top = row * ROW_PITCH + GAP / 2;

            return (
              <div
                key={pos}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width: CELL_W,
                  height: CELL_H,
                  clipPath: CLIP,
                }}
                className={cn(
                  "flex flex-col items-center justify-center select-none",
                  champion
                    ? [colors?.bg, colors?.text]
                    : "bg-muted/20"
                )}
                title={
                  champion
                    ? `${champion.name} ${unit!.starLevel}★`
                    : undefined
                }
              >
                {champion && unit && (
                  <ChampionDisplay champion={champion} unit={unit} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
