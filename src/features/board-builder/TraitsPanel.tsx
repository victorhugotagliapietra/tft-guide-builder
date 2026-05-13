import { useState, useEffect, useMemo } from "react";
import type { TraitBreakpoint } from "@/features/tft-data/types";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import { getActiveTraitsOnly, type ActiveTrait } from "@/features/tft-data/trait-synergies";
import type { BoardUnit } from "./types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tier visual mapping — subtle TFT-style coloring per breakpoint tier
// ---------------------------------------------------------------------------

const TIER_CLASSES: Record<
  TraitBreakpoint["tier"],
  { row: string; iconBg: string; count: string; label: string }
> = {
  bronze: {
    row: "bg-amber-950/40 border-amber-700/40 hover:bg-amber-950/60",
    iconBg: "bg-amber-900/60 ring-amber-700/50",
    count: "text-amber-200",
    label: "text-amber-100",
  },
  silver: {
    row: "bg-slate-700/30 border-slate-400/30 hover:bg-slate-700/50",
    iconBg: "bg-slate-600/50 ring-slate-300/50",
    count: "text-slate-100",
    label: "text-slate-100",
  },
  gold: {
    row: "bg-yellow-900/40 border-yellow-500/40 hover:bg-yellow-900/60 shadow-[0_0_8px_-2px_rgba(250,204,21,0.35)]",
    iconBg: "bg-yellow-800/60 ring-yellow-400/60",
    count: "text-yellow-200",
    label: "text-yellow-100",
  },
  prismatic: {
    row: "bg-gradient-to-r from-fuchsia-900/40 via-violet-900/40 to-cyan-900/40 border-fuchsia-400/50 hover:from-fuchsia-900/60 hover:to-cyan-900/60 shadow-[0_0_10px_-2px_rgba(232,121,249,0.45)]",
    iconBg: "bg-gradient-to-br from-fuchsia-700/60 to-cyan-700/60 ring-fuchsia-300/60",
    count: "text-fuchsia-100",
    label: "text-fuchsia-50",
  },
};

// ---------------------------------------------------------------------------
// Trait icon with one-shot fallback
// ---------------------------------------------------------------------------

function TraitIcon({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (!url || failed) {
    return (
      <div className={cn("flex items-center justify-center text-[8px] uppercase tracking-tight font-bold opacity-60", className)}>
        {alt.slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className={cn("object-contain", className)}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Single trait row
// ---------------------------------------------------------------------------

function TraitRow({ active }: { active: ActiveTrait }) {
  // We only render in TraitsPanel when activeBp is non-null, so this is safe
  const tier = active.activeBp!.tier;
  const classes = TIER_CLASSES[tier];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
        classes.row
      )}
      title={`${active.trait.name} — ${tier} (${active.unitCount} units)`}
    >
      <div
        className={cn(
          "w-6 h-6 shrink-0 flex items-center justify-center rounded ring-1",
          classes.iconBg
        )}
      >
        <TraitIcon url={active.trait.iconUrl} alt={active.trait.name} className="w-4 h-4" />
      </div>
      <span className={cn("text-xs font-medium leading-none truncate flex-1", classes.label)}>
        {active.trait.name}
      </span>
      <span className={cn("text-xs font-bold tabular-nums leading-none", classes.count)}>
        {active.unitCount}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type Props = {
  units: BoardUnit[];
};

export function TraitsPanel({ units }: Props) {
  const { championMap, traitMap } = useTFTData();

  // Memoize the active trait computation — it only depends on the unit list
  // (positions don't matter) and the data maps (stable per query response).
  const activeTraits = useMemo(
    () => getActiveTraitsOnly(units, championMap, traitMap),
    [units, championMap, traitMap]
  );

  return (
    <div className="w-44 shrink-0 flex flex-col gap-1.5 self-start">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold text-foreground/70 tracking-wider uppercase">
          Traits
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          {activeTraits.length}
        </span>
      </div>
      {activeTraits.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/50 italic px-1 py-2">
          No active traits
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {activeTraits.map((at) => (
            <TraitRow key={at.trait.apiName} active={at} />
          ))}
        </div>
      )}
    </div>
  );
}
