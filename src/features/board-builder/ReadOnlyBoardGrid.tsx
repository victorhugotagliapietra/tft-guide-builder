import { BOARD_ROWS, BOARD_COLS, coordsToPosition } from "./grid";
import { COST_COLORS } from "@/features/tft-data/mock-champions";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { BoardUnit } from "./types";
import { cn } from "@/lib/utils";

type Props = {
  units: BoardUnit[];
};

export function ReadOnlyBoardGrid({ units }: Props) {
  const { championMap, items: allItems } = useTFTData();

  const unitMap = new Map(units.map((u) => [u.position, u]));
  const itemMap = new Map(allItems.map((i) => [i.apiName, i]));

  return (
    <div className="space-y-1 overflow-x-auto pb-1">
      {Array.from({ length: BOARD_ROWS }, (_, row) => (
        <div key={row} className="flex gap-1 min-w-max">
          {Array.from({ length: BOARD_COLS }, (_, col) => {
            const pos = coordsToPosition(row, col);
            const unit = unitMap.get(pos);
            const champion = unit ? championMap.get(unit.championKey) : undefined;
            const colors = champion ? COST_COLORS[champion.cost] ?? COST_COLORS[1] : null;
            const unitItems = unit
              ? unit.items.map((key) => itemMap.get(key)).filter(Boolean)
              : [];
            const hasItems = unitItems.length > 0;

            return (
              <div
                key={pos}
                className={cn(
                  "w-12 rounded-md border flex flex-col items-center justify-start overflow-hidden shrink-0 select-none",
                  hasItems ? "h-[72px] pt-1" : "h-14 pt-1",
                  champion
                    ? [colors?.bg, colors?.text, "border-transparent"]
                    : "bg-muted/20 border-border/30"
                )}
                title={champion ? `${champion.name} ${"★".repeat(unit!.starLevel)}` : undefined}
              >
                {champion ? (
                  <>
                    {champion.iconUrl ? (
                      <img
                        src={champion.iconUrl}
                        alt={champion.name}
                        className="w-8 h-8 rounded object-cover shrink-0"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="w-full text-center px-0.5 text-[9px] leading-tight truncate">
                        {champion.name.slice(0, 7)}
                      </span>
                    )}
                    <span className="text-[9px] opacity-70 leading-none mt-0.5">
                      {"★".repeat(unit!.starLevel)}
                    </span>
                    {hasItems && (
                      <div className="flex gap-0.5 justify-center mt-1">
                        {unitItems.map((item, i) =>
                          item?.iconUrl ? (
                            <img
                              key={i}
                              src={item.iconUrl}
                              alt={item.name}
                              className="w-3.5 h-3.5 rounded-sm object-cover"
                              title={item.name}
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div
                              key={i}
                              className="w-3.5 h-3.5 rounded-sm bg-black/40"
                              title={item?.name}
                            />
                          )
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
