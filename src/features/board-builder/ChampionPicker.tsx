import { useState, useMemo } from "react";
import { Search, Loader2 } from "lucide-react";
import { COST_COLORS } from "@/features/tft-data/mock-champions";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTChampion } from "@/features/tft-data/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (champion: TFTChampion) => void;
  occupiedKeys?: string[];
};

const COST_OPTIONS = [1, 2, 3, 4, 5] as const;

export function ChampionPicker({ open, onOpenChange, onSelect, occupiedKeys = [] }: Props) {
  const [search, setSearch] = useState("");
  const [costFilter, setCostFilter] = useState<number | null>(null);
  const { champions, isLoading } = useTFTData();

  const filtered = useMemo(() => {
    return champions.filter((c) => {
      const matchesCost = costFilter === null || c.cost === costFilter;
      const matchesSearch =
        search.trim() === "" ||
        c.name.toLowerCase().includes(search.toLowerCase());
      return matchesCost && matchesSearch;
    });
  }, [champions, search, costFilter]);

  function handleSelect(champion: TFTChampion) {
    onSelect(champion);
    setSearch("");
    setCostFilter(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a champion</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          <div className="flex gap-1.5 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant={costFilter === null ? "default" : "outline"}
              onClick={() => setCostFilter(null)}
              className="h-7 text-xs"
            >
              All
            </Button>
            {COST_OPTIONS.map((cost) => {
              const colors = COST_COLORS[cost];
              return (
                <button
                  key={cost}
                  type="button"
                  onClick={() => setCostFilter(costFilter === cost ? null : cost)}
                  className={cn(
                    "h-7 px-2.5 rounded-md text-xs font-medium border transition-opacity",
                    colors.bg,
                    colors.text,
                    costFilter !== null && costFilter !== cost && "opacity-40"
                  )}
                >
                  {cost}★
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
            {isLoading && (
              <div className="col-span-3 flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading champions…
              </div>
            )}
            {!isLoading && filtered.map((champion) => {
              const colors = COST_COLORS[champion.cost] ?? COST_COLORS[1];
              const alreadyOnBoard = occupiedKeys.includes(champion.apiName);
              return (
                <button
                  key={champion.apiName}
                  type="button"
                  disabled={alreadyOnBoard}
                  onClick={() => handleSelect(champion)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md px-2 py-2 text-xs font-medium border transition-colors",
                    colors.bg,
                    colors.text,
                    "hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  {champion.iconUrl ? (
                    <img
                      src={champion.iconUrl}
                      alt={champion.name}
                      className="w-8 h-8 rounded object-cover mb-0.5"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : null}
                  <span className="truncate w-full text-center">{champion.name}</span>
                  <span className="opacity-70">{champion.cost}★</span>
                </button>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <p className="col-span-3 text-center text-sm text-muted-foreground py-4">
                No champions found
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
