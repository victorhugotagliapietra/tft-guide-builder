import { memo, useState, useEffect, useMemo, Fragment } from "react";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import { computeActiveTraits, type ActiveTrait } from "@/features/tft-data/trait-synergies";
import type { BoardUnit } from "./types";
import type { TraitBreakpoint } from "@/features/tft-data/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A "unique" trait has exactly one breakpoint — it activates the moment a
// single champion with that trait is placed (Redeemer, Party Animal, etc.).
// These get a distinct violet color, separate from gold.
function isUniqueTrait(bps: TraitBreakpoint[]): boolean {
  return bps.length === 1;
}

// ---------------------------------------------------------------------------
// Tier visual config
// ---------------------------------------------------------------------------

type TierKey = "inactive" | "bronze" | "silver" | "gold" | "prismatic" | "unique";

const TIER_CLASSES: Record<TierKey, { row: string; iconBg: string; count: string; name: string }> =
  {
    inactive: {
      row: "bg-white/[0.03] border-white/[0.08]",
      iconBg: "bg-white/[0.08] ring-white/10",
      count: "text-white/30",
      name: "text-white/35",
    },
    bronze: {
      row: "bg-amber-950/50 border-amber-800/50",
      iconBg: "bg-amber-900/70 ring-amber-600/50",
      count: "text-amber-300",
      name: "text-amber-100/90",
    },
    silver: {
      row: "bg-slate-700/35 border-slate-500/35",
      iconBg: "bg-slate-600/60 ring-slate-300/40",
      count: "text-slate-200",
      name: "text-slate-100",
    },
    gold: {
      row: "bg-yellow-900/45 border-yellow-600/45 shadow-[0_0_8px_-3px_rgba(250,204,21,0.35)]",
      iconBg: "bg-yellow-800/70 ring-yellow-500/55",
      count: "text-yellow-300",
      name: "text-yellow-100",
    },
    prismatic: {
      row: "bg-gradient-to-r from-fuchsia-900/40 via-violet-900/40 to-cyan-900/40 border-fuchsia-400/50 shadow-[0_0_10px_-3px_rgba(232,121,249,0.4)]",
      iconBg: "bg-gradient-to-br from-fuchsia-700/60 to-cyan-700/60 ring-fuchsia-300/50",
      count: "text-fuchsia-100",
      name: "text-fuchsia-50",
    },
    unique: {
      row: "bg-violet-950/50 border-violet-500/50 shadow-[0_0_8px_-3px_rgba(167,139,250,0.35)]",
      iconBg: "bg-violet-800/70 ring-violet-400/50",
      count: "text-violet-200",
      name: "text-violet-100",
    },
  };

// Color used for individual reached breakpoint numbers
const BP_ACTIVE_COLOR: Record<TraitBreakpoint["tier"], string> = {
  bronze: "text-amber-400",
  silver: "text-slate-300",
  gold: "text-yellow-400",
  prismatic: "text-fuchsia-300",
};

// ---------------------------------------------------------------------------
// Trait icon with one-shot fallback
// ---------------------------------------------------------------------------

function TraitIcon({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (!url || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-[8px] uppercase tracking-tight font-bold opacity-50",
          className,
        )}
      >
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
  const bps = active.trait.breakpoints;
  const isActive = active.activeBp !== null;
  const unique = isUniqueTrait(bps);

  let tierKey: TierKey;
  if (!isActive) {
    tierKey = "inactive";
  } else if (unique) {
    tierKey = "unique";
  } else {
    tierKey = active.activeBp!.tier;
  }

  const cls = TIER_CLASSES[tierKey];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-1.5 py-[5px] transition-colors",
        cls.row,
      )}
      title={`${active.trait.name} — ${active.unitCount} / ${bps.map((b) => b.minUnits).join(" > ")}`}
    >
      {/* Trait icon badge */}
      <div
        className={cn(
          "w-6 h-6 shrink-0 flex items-center justify-center rounded ring-1",
          cls.iconBg,
        )}
      >
        <TraitIcon url={active.trait.iconUrl} alt={active.trait.name} className="w-4 h-4" />
      </div>

      {/* Unit count */}
      <span
        className={cn(
          "text-sm font-bold tabular-nums w-4 text-center leading-none shrink-0",
          cls.count,
        )}
      >
        {active.unitCount}
      </span>

      {/* Trait name */}
      <span className={cn("text-xs font-medium flex-1 truncate leading-none min-w-0", cls.name)}>
        {active.trait.name}
      </span>

      {/* Breakpoints chain — e.g. "2 > 4 > 6" */}
      <div className="flex items-center shrink-0 gap-[1px] text-[10px] leading-none font-mono">
        {bps.map((bp, i) => (
          <Fragment key={bp.minUnits}>
            {i > 0 && <span className="text-white/20 px-[1px]">›</span>}
            <span
              className={
                active.unitCount >= bp.minUnits ? BP_ACTIVE_COLOR[bp.tier] : "text-white/22"
              }
            >
              {bp.minUnits}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type Props = {
  units: BoardUnit[];
};

function TraitsPanelImpl({ units }: Props) {
  const { championMap, traitMap } = useTFTData();

  // Use computeActiveTraits (not getActiveTraitsOnly) to include traits that
  // have units but haven't hit their first breakpoint yet — shown dimmed.
  const allTraits = useMemo(
    () => computeActiveTraits(units, championMap, traitMap),
    [units, championMap, traitMap],
  );

  const activeCount = allTraits.filter((t) => t.activeBp !== null).length;

  return (
    <div className="w-52 shrink-0 flex flex-col gap-1.5 self-start">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold text-foreground/70 tracking-wider uppercase">
          Traits
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          {activeCount > 0 ? activeCount : ""}
        </span>
      </div>

      {allTraits.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/50 italic px-1 py-2">No traits</p>
      ) : (
        // Internal vertical scroll with a stable gutter. We reserve the
        // scrollbar's width at all times via `scrollbar-gutter: stable` so the
        // panel never expands horizontally when the bar appears — this keeps
        // the board centered and the augment panel aligned regardless of how
        // many traits become active. The custom webkit scrollbar styling
        // matches the items panel for visual consistency.
        <div
          className={cn(
            "flex flex-col gap-[3px] overflow-y-auto pr-1",
            "scroll-smooth",
            "[&::-webkit-scrollbar]:w-1.5",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:bg-white/10",
            "hover:[&::-webkit-scrollbar-thumb]:bg-white/25",
          )}
          style={{ maxHeight: 360, scrollbarGutter: "stable" }}
        >
          {allTraits.map((at) => (
            <TraitRow key={at.trait.apiName} active={at} />
          ))}
        </div>
      )}
    </div>
  );
}

export const TraitsPanel = memo(TraitsPanelImpl);
