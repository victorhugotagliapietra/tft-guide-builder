import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { ChevronDown, ChevronRight, Copy, Trash2, Link, Search, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  useTFTData,
  TRAINING_DUMMY_API_NAME,
  TRAINING_DUMMY_LOCAL_ICON,
} from "@/features/tft-data/use-tft-data";
import { generatePlannerCode } from "@/features/tft-data/planner-code";
import type { TFTChampion, TFTItem } from "@/features/tft-data/types";
import { ItemDragOverlay } from "./ItemsPanel";
import { AugmentDragOverlay, AugmentsPanel } from "./AugmentsPanel";
import { BOARD_SIZE } from "./grid";
import {
  STEP_TYPES,
  STEP_TYPE_LABELS,
  AUGMENT_SLOT_COUNT,
  emptyAugmentSlots,
  type BoardStep,
  type BoardUnit,
  type AugmentSlots,
} from "./types";
import { BoardGrid } from "./BoardGrid";
import { ItemsPanel } from "./ItemsPanel";
import { TraitsPanel } from "./TraitsPanel";
import { AugmentSlotsPanel } from "./AugmentSlotsPanel";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// Verbose drag/diagnostic logs are useful while developing but become noise
// in production. Gating behind import.meta.env.DEV avoids paying the string-
// formatting cost on every drag event in shipped builds.
const DEV = import.meta.env.DEV;
const debug = (...args: unknown[]) => {
  if (DEV) console.debug(...args);
};

// ---------------------------------------------------------------------------
// Drag zones — droppable IDs encode the zone type:
//   "hex:<position>"    → board hex (drop target for champions & items, source for board units)
//   "panel:trash"       → champions/augments/items panel area (drop target to remove a board unit)
//   "champion:<api>"    → draggable from champion pool (source only)
//   "item:<api>"        → draggable from item pool (source only)
//   "augment:<api>"     → draggable from augments pool (source only)
//   "augslot:<index>"   → augment slot (drop target only)
//   "slotaug:<index>"   → augment currently in slot N (source only — drag to swap/remove)
// ---------------------------------------------------------------------------

const dragCollisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return [];

  const activeId = String(args.active.id);

  // Augment drags (from pool or from an existing slot) may only target an
  // augment slot. Everything else cancels (returns []) so the drop becomes a
  // no-op or — for slot sources — a "remove" via `over === null` in dragEnd.
  if (activeId.startsWith("augment:") || activeId.startsWith("slotaug:")) {
    const slot = hits.find((c) => String(c.id).startsWith("augslot:"));
    return slot ? [slot] : [];
  }

  // Hex always wins over the surrounding trash container — otherwise an
  // occupied hex inside the trash zone could ambiguously resolve to trash.
  const hex = hits.find((c) => String(c.id).startsWith("hex:"));
  if (hex) return [hex];
  const trash = hits.find((c) => String(c.id) === "panel:trash");
  if (trash) return [trash];
  return [];
};

// ---------------------------------------------------------------------------
// Cost-tier styling (matches BoardGrid hex border colors)
// ---------------------------------------------------------------------------

const COST_RING: Record<number, string> = {
  0: "ring-1 ring-zinc-500/50",
  1: "ring-1 ring-slate-400/60",
  2: "ring-2 ring-green-500/70",
  3: "ring-2 ring-blue-500/70",
  4: "ring-2 ring-purple-500/80",
  5: "ring-2 ring-yellow-400/90 shadow-[0_0_6px_1px_rgba(250,204,21,0.25)]",
};

const COST_NAME_COLOR: Record<number, string> = {
  0: "text-zinc-400",
  1: "text-slate-300",
  2: "text-green-400",
  3: "text-blue-400",
  4: "text-purple-400",
  5: "text-yellow-400",
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

  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [champion.iconUrl, champion.fallbackIconUrl]);

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
    !primaryFailed && champion.iconUrl
      ? champion.iconUrl
      : !fallbackFailed && champion.fallbackIconUrl
        ? champion.fallbackIconUrl
        : null;

  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/30 text-[8px] text-muted-foreground text-center leading-tight px-0.5",
          className,
        )}
      >
        {champion.name.slice(0, 8)}
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
// Draggable + clickable champion tile
// ---------------------------------------------------------------------------

const DraggableChampionTile = memo(function DraggableChampionTile({
  champion,
  onClick,
}: {
  champion: TFTChampion;
  onClick: (apiName: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `champion:${champion.apiName}`,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      title={champion.name}
      onClick={() => onClick(champion.apiName)}
      className={cn(
        "group flex flex-col items-center gap-1 cursor-pointer select-none transition-all duration-100",
        isDragging && "opacity-40",
      )}
    >
      <div
        className={cn(
          "w-11 h-11 rounded-lg overflow-hidden transition-all duration-150",
          COST_RING[champion.cost] ?? COST_RING[1],
          "group-hover:scale-110 group-hover:brightness-110",
        )}
      >
        <ChampionImg champion={champion} className="w-full h-full" />
      </div>
      <span
        className={cn(
          "text-[9px] leading-none text-center truncate w-12",
          COST_NAME_COLOR[champion.cost] ?? "text-muted-foreground",
          "group-hover:brightness-125",
        )}
      >
        {champion.name}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Drag overlay
// ---------------------------------------------------------------------------

function DragOverlayContent({ champion }: { champion: TFTChampion }) {
  return (
    <div className="flex flex-col items-center gap-1 select-none pointer-events-none">
      <div
        className={cn(
          "w-11 h-11 rounded-lg overflow-hidden shadow-2xl",
          COST_RING[champion.cost] ?? COST_RING[1],
        )}
      >
        <ChampionImg champion={champion} className="w-full h-full" />
      </div>
      <span
        className={cn(
          "text-[9px] leading-none text-center",
          COST_NAME_COLOR[champion.cost] ?? "text-muted-foreground",
        )}
      >
        {champion.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort: cost asc, then name; specials always at the end
// ---------------------------------------------------------------------------

const SPECIAL_NAMES = new Set([
  "Golem",
  "Training Dummy",
  "Practice Dummy",
  "Rift Scuttler",
  "Mini Black Ball",
  "Golden Ox",
]);

function isSpecial(c: TFTChampion): boolean {
  return !c.apiName.startsWith("TFT17_") || c.cost === 0 || SPECIAL_NAMES.has(c.name);
}

function isTrainingDummy(c: TFTChampion): boolean {
  const lower = c.name.toLowerCase();
  return lower.includes("training") && lower.includes("dummy");
}

function sortChampions(champions: TFTChampion[]): TFTChampion[] {
  return [...champions].sort((a, b) => {
    const aS = isSpecial(a);
    const bS = isSpecial(b);
    if (aS !== bS) return aS ? 1 : -1;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Match a champion against a free-form search query. See original docstring
 * (preserved logic): supports a `<cost> <substr>` prefix and falls back to
 * name/trait substring match.
 */
const COST_PREFIX_RE = /^([1-5])(?:\s+(.*))?$/;

function matchesQuery(c: TFTChampion, q: string): boolean {
  if (!q) return true;
  if (isTrainingDummy(c)) {
    return "training".includes(q) || "dummy".includes(q) || "training dummy".includes(q);
  }
  const costMatch = COST_PREFIX_RE.exec(q);
  if (costMatch) {
    const requiredCost = parseInt(costMatch[1], 10);
    if (c.cost !== requiredCost) return false;
    const rest = (costMatch[2] ?? "").trim();
    if (!rest) return true;
    if (c.name.toLowerCase().includes(rest)) return true;
    for (const t of c.traits) {
      if (t.toLowerCase().includes(rest)) return true;
    }
    return false;
  }
  if (c.name.toLowerCase().includes(q)) return true;
  for (const t of c.traits) {
    if (t.toLowerCase().includes(q)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Champion panel content
// ---------------------------------------------------------------------------

const ChampionPanelContent = memo(function ChampionPanelContent({
  onChampionClick,
}: {
  onChampionClick: (apiName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { champions } = useTFTData();

  const sorted = useMemo(() => sortChampions(champions), [champions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => matchesQuery(c, q));
  }, [sorted, search]);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center justify-end gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 pl-6 pr-6 text-xs w-32 bg-background/50"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => {
                setSearch("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <XIcon className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-x-1.5 gap-y-2 justify-items-center">
        {filtered.map((champion) => (
          <DraggableChampionTile
            key={champion.apiName}
            champion={champion}
            onClick={onChampionClick}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground/60 py-4 [grid-column:1/-1] text-center italic">
            No champions found
          </p>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Tabbed pool shell
// ---------------------------------------------------------------------------

type PoolTab = "champions" | "augments";

const PoolPanel = memo(function PoolPanel({
  activeTab,
  onTabChange,
  onChampionClick,
  isRemoveTarget,
  isOver,
}: {
  activeTab: PoolTab;
  onTabChange: (tab: PoolTab) => void;
  onChampionClick: (apiName: string) => void;
  isRemoveTarget: boolean;
  isOver: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 min-h-0 rounded-xl transition-colors p-3 border border-white/5 bg-background/30",
        isRemoveTarget && "ring-2 ring-destructive/50 border-destructive/40",
        isOver && isRemoveTarget && "bg-destructive/15",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-0.5 bg-muted/20 rounded-md p-0.5">
          {(["champions", "augments"] as PoolTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase rounded transition-all",
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70",
              )}
            >
              {tab === "champions" ? "Champions" : "Augments"}
            </button>
          ))}
        </div>

        {isRemoveTarget && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive">
            Drop to remove
          </span>
        )}
      </div>

      {activeTab === "champions" ? (
        <ChampionPanelContent onChampionClick={onChampionClick} />
      ) : (
        <AugmentsPanel />
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Extracted input subcomponents.
//
// These hold their own draft state and only commit to the parent via
// onUpdate when the user pauses (debounced) or blurs. This keeps every
// keystroke in the title/level/notes inputs from re-rendering the whole
// BoardStepCard (and through it, the DndContext + champion pool + items
// grid + augments grid + board hexes).
// ---------------------------------------------------------------------------

const TITLE_COMMIT_DEBOUNCE_MS = 250;

const StepTitleField = memo(function StepTitleField({
  initialTitle,
  onCommit,
}: {
  initialTitle: string;
  onCommit: (title: string) => void;
}) {
  const [value, setValue] = useState(initialTitle);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    setValue(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setValue(next);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onCommitRef.current(next.trim() || "New board");
    }, TITLE_COMMIT_DEBOUNCE_MS);
  };

  const handleBlur = () => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onCommitRef.current(value.trim() || "New board");
  };

  return (
    <div className="sm:col-span-1 space-y-1.5">
      <Label className="text-xs text-muted-foreground">Title</Label>
      <Input
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="e.g. Level 6 stabilize"
        className="h-8 text-sm bg-background/60"
      />
    </div>
  );
});

const StepLevelField = memo(function StepLevelField({
  initialLevel,
  onCommit,
}: {
  initialLevel: number;
  onCommit: (level: number) => void;
}) {
  const [text, setText] = useState(String(initialLevel));
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    setText(String(initialLevel));
  }, [initialLevel]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Level</Label>
      <Input
        type="number"
        min={1}
        max={10}
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next === "") return;
          const val = parseInt(next, 10);
          if (!isNaN(val) && val >= 1 && val <= 10) onCommitRef.current(val);
        }}
        onBlur={() => {
          const val = parseInt(text, 10);
          if (isNaN(val) || val < 1 || val > 10) {
            setText(String(initialLevel));
          }
        }}
        className="h-8 text-sm bg-background/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  );
});

const StepTypeField = memo(function StepTypeField({
  stepType,
  onCommit,
}: {
  stepType: BoardStep["stepType"];
  onCommit: (val: BoardStep["stepType"]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Type</Label>
      <Select value={stepType} onValueChange={(v) => onCommit(v as BoardStep["stepType"])}>
        <SelectTrigger className="h-8 text-sm bg-background/60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STEP_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {STEP_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});

// Notes editor wrapper — RichTextEditor already debounces internally, so the
// only job here is to render with the initial value once and let the editor
// own its content. Memoizing this isolates the (heavy) TipTap re-renders from
// the rest of the step card.
const StepNotesField = memo(function StepNotesField({
  initialDescription,
  onCommit,
}: {
  initialDescription: string;
  onCommit: (html: string) => void;
}) {
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Notes</Label>
      <RichTextEditor
        value={initialDescription}
        onChange={(html) => onCommitRef.current(html)}
        placeholder="When to roll, when to level, who holds items…"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  step: BoardStep;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: string, patch: Partial<BoardStep>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
};

// ---------------------------------------------------------------------------
// BoardStepCard
// ---------------------------------------------------------------------------

function BoardStepCardImpl({
  step,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onDuplicate,
}: Props) {
  const { championMap, augmentMap, itemMap, setNumber, plannerCodeMap } = useTFTData();

  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const boardContainerRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Stable refs to mutable state so child callbacks captured below never need
  // to be rebuilt when units/augments/etc change (only the ref's `.current`
  // updates). This is the key to memoizing the heavy child components like
  // BoardGrid — they only re-render when their actual data props change.
  const stepRef = useRef(step);
  stepRef.current = step;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // -------------------------------------------------------------------------
  // Drag handlers
  // -------------------------------------------------------------------------

  type ParsedId =
    | { zone: "board"; pos: number }
    | { zone: "champion-pool"; apiName: string }
    | { zone: "item-pool"; apiName: string }
    | { zone: "augment-pool"; apiName: string }
    | { zone: "augment-slot"; index: number }
    | { zone: "slot-aug"; index: number }
    | { zone: "remove" }
    | { zone: "unknown" };

  function parseId(raw: string | null | undefined): ParsedId {
    if (!raw) return { zone: "unknown" };
    if (raw.startsWith("hex:")) return { zone: "board", pos: parseInt(raw.slice(4), 10) };
    if (raw.startsWith("champion:")) return { zone: "champion-pool", apiName: raw.slice(9) };
    if (raw.startsWith("item:")) return { zone: "item-pool", apiName: raw.slice(5) };
    if (raw.startsWith("augment:")) return { zone: "augment-pool", apiName: raw.slice(8) };
    if (raw.startsWith("augslot:"))
      return { zone: "augment-slot", index: parseInt(raw.slice(8), 10) };
    if (raw.startsWith("slotaug:")) return { zone: "slot-aug", index: parseInt(raw.slice(8), 10) };
    if (raw === "panel:trash") return { zone: "remove" };
    return { zone: "unknown" };
  }

  function handleDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    debug("[TFT][drag] start", { activeId: id });
    setActiveDragId(id);
    setSelectedPos(null);
  }

  function isPointerInsideBoard(
    activatorEvent: DragEndEvent["activatorEvent"],
    delta: DragEndEvent["delta"],
  ): boolean {
    const el = boardContainerRef.current;
    if (!el) return false;
    const ev = activatorEvent as PointerEvent | MouseEvent | TouchEvent | null;
    let startX: number | undefined;
    let startY: number | undefined;
    if (ev && "clientX" in ev) {
      startX = (ev as PointerEvent).clientX;
      startY = (ev as PointerEvent).clientY;
    } else if (ev && "touches" in ev && ev.touches[0]) {
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
    }
    if (startX === undefined || startY === undefined) return false;
    const x = startX + delta.x;
    const y = startY + delta.y;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function handleDragEnd({ active, over, activatorEvent, delta }: DragEndEvent) {
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;
    setActiveDragId(null);

    const source = parseId(activeId);
    const destination = over ? parseId(overId) : { zone: "outside" as const };

    const currentStep = stepRef.current;

    if (source.zone === "board") {
      if (destination.zone === "remove") {
        removeUnitAt(source.pos);
        return;
      }
      if (destination.zone === "board") {
        moveOrSwap(source.pos, destination.pos);
        return;
      }
      const stayedOnBoard = isPointerInsideBoard(activatorEvent, delta);
      if (stayedOnBoard) return;
      removeUnitAt(source.pos);
      return;
    }

    if (source.zone === "champion-pool") {
      if (destination.zone === "board") placeChampion(source.apiName, destination.pos);
      return;
    }

    if (source.zone === "item-pool") {
      if (destination.zone !== "board") return;
      const targetUnit = currentStep.units.find((u) => u.position === destination.pos);
      if (!targetUnit) return;
      if ((targetUnit.items?.length ?? 0) >= 3) {
        toast.error("Champions can hold at most 3 items");
        return;
      }
      onUpdateRef.current(currentStep.id, {
        units: currentStep.units.map((u) =>
          u.position === destination.pos
            ? { ...u, items: [...(u.items ?? []), source.apiName] }
            : u,
        ),
      });
      return;
    }

    if (source.zone === "augment-pool") {
      if (destination.zone !== "augment-slot") return;
      assignAugmentToSlot(source.apiName, destination.index);
      return;
    }

    if (source.zone === "slot-aug") {
      if (!over) {
        removeAugmentFromSlot(source.index);
        return;
      }
      if (destination.zone === "augment-slot") {
        moveOrSwapAugments(source.index, destination.index);
        return;
      }
      if (destination.zone === "remove") {
        removeAugmentFromSlot(source.index);
        return;
      }
      return;
    }
  }

  function handleDragCancel() {
    setActiveDragId(null);
  }

  // -------------------------------------------------------------------------
  // Board mutation — read step + onUpdate from refs so these helpers don't
  // need rebuilding on every render.
  // -------------------------------------------------------------------------

  function placeChampion(apiName: string, targetPos: number) {
    const cur = stepRef.current;
    if (cur.units.some((u) => u.position === targetPos)) return;
    const newUnit: BoardUnit = {
      id: crypto.randomUUID(),
      championKey: apiName,
      position: targetPos,
      items: [],
      starLevel: 0,
      isCarry: false,
      isItemHolder: false,
    };
    onUpdateRef.current(cur.id, { units: [...cur.units, newUnit] });
  }

  const placeChampionAtFirstEmpty = useCallback((apiName: string) => {
    const cur = stepRef.current;
    const occupied = new Set(cur.units.map((u) => u.position));
    for (let pos = 0; pos < BOARD_SIZE; pos++) {
      if (!occupied.has(pos)) {
        if (cur.units.some((u) => u.position === pos)) return;
        const newUnit: BoardUnit = {
          id: crypto.randomUUID(),
          championKey: apiName,
          position: pos,
          items: [],
          starLevel: 0,
          isCarry: false,
          isItemHolder: false,
        };
        onUpdateRef.current(cur.id, { units: [...cur.units, newUnit] });
        return;
      }
    }
    toast.error("Board is full");
  }, []);

  function moveOrSwap(fromPos: number, targetPos: number) {
    if (fromPos === targetPos) return;
    const cur = stepRef.current;
    const hasTarget = cur.units.some((u) => u.position === targetPos);
    onUpdateRef.current(cur.id, {
      units: cur.units.map((u) => {
        if (u.position === fromPos) return { ...u, position: targetPos };
        if (hasTarget && u.position === targetPos) return { ...u, position: fromPos };
        return u;
      }),
    });
    setSelectedPos(null);
  }

  function removeUnitAt(pos: number) {
    const cur = stepRef.current;
    onUpdateRef.current(cur.id, { units: cur.units.filter((u) => u.position !== pos) });
    setSelectedPos(null);
  }

  // augmentSlots: defensive normalize to a fixed-length tuple.
  const augmentSlots: AugmentSlots = useMemo(() => {
    const raw = step.augments;
    if (!Array.isArray(raw)) return emptyAugmentSlots();
    if (raw.length === AUGMENT_SLOT_COUNT) return raw as AugmentSlots;
    const out: AugmentSlots = emptyAugmentSlots();
    const copyN = Math.min(raw.length, AUGMENT_SLOT_COUNT);
    for (let i = 0; i < copyN; i++) out[i] = raw[i] ?? null;
    return out;
  }, [step.augments]);

  // Augment helpers use the memoized augmentSlots so we don't recompute from
  // raw step.augments inside each call.
  function assignAugmentToSlot(apiName: string, slotIdx: number) {
    if (slotIdx < 0 || slotIdx >= AUGMENT_SLOT_COUNT) return;
    const next = augmentSlots.map((cur, i) => {
      if (i === slotIdx) return apiName;
      if (cur === apiName) return null;
      return cur;
    });
    onUpdateRef.current(stepRef.current.id, { augments: next });
  }

  function moveOrSwapAugments(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || toIdx < 0) return;
    if (fromIdx >= AUGMENT_SLOT_COUNT || toIdx >= AUGMENT_SLOT_COUNT) return;
    const fromVal = augmentSlots[fromIdx] ?? null;
    if (!fromVal) return;
    const toVal = augmentSlots[toIdx] ?? null;
    const next = augmentSlots.map((cur, i) => {
      if (i === fromIdx) return toVal;
      if (i === toIdx) return fromVal;
      return cur;
    });
    onUpdateRef.current(stepRef.current.id, { augments: next });
  }

  function removeAugmentFromSlot(slotIdx: number) {
    if (slotIdx < 0 || slotIdx >= AUGMENT_SLOT_COUNT) return;
    const next = augmentSlots.map((cur, i) => (i === slotIdx ? null : cur));
    onUpdateRef.current(stepRef.current.id, { augments: next });
  }

  const handleRemoveItem = useCallback((pos: number, itemIndex: number) => {
    const cur = stepRef.current;
    onUpdateRef.current(cur.id, {
      units: cur.units.map((u) =>
        u.position === pos ? { ...u, items: u.items.filter((_, i) => i !== itemIndex) } : u,
      ),
    });
  }, []);

  const handleSetStarLevel = useCallback((pos: number, level: number) => {
    const clamped = Math.max(0, Math.min(3, level));
    const cur = stepRef.current;
    onUpdateRef.current(cur.id, {
      units: cur.units.map((u) => (u.position === pos ? { ...u, starLevel: clamped } : u)),
    });
  }, []);

  const handleHexClick = useCallback((pos: number) => {
    setSelectedPos((p) => (p === pos ? null : pos));
  }, []);

  // Per-field commit helpers — stable identities so the memoized sub-fields
  // don't bust their memo. They reach into refs for the latest step.id /
  // onUpdate.
  const commitTitle = useCallback((title: string) => {
    onUpdateRef.current(stepRef.current.id, { title });
  }, []);
  const commitLevel = useCallback((level: number) => {
    onUpdateRef.current(stepRef.current.id, { level });
  }, []);
  const commitStepType = useCallback((stepType: BoardStep["stepType"]) => {
    onUpdateRef.current(stepRef.current.id, { stepType });
  }, []);
  const commitNotes = useCallback((description: string) => {
    onUpdateRef.current(stepRef.current.id, { description });
  }, []);

  function handleCopyPlannerCode() {
    const result = generatePlannerCode(step.units, setNumber, plannerCodeMap, (apiName) => {
      const c = championMap.get(apiName);
      return c ? { cost: c.cost } : undefined;
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    navigator.clipboard.writeText(result.code).then(
      () => toast.success("Planner code copied!"),
      () => toast.error("Failed to write to clipboard."),
    );
  }

  // -------------------------------------------------------------------------
  // Drag overlay champion / item / augment
  // -------------------------------------------------------------------------

  const overlayChampion: TFTChampion | null = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("champion:"))
      return championMap.get(activeDragId.replace("champion:", "")) ?? null;
    if (activeDragId.startsWith("hex:")) {
      const pos = parseInt(activeDragId.replace("hex:", ""), 10);
      const unit = step.units.find((u) => u.position === pos);
      return unit ? (championMap.get(unit.championKey) ?? null) : null;
    }
    return null;
  }, [activeDragId, championMap, step.units]);

  const overlayItem: TFTItem | null = useMemo(() => {
    if (!activeDragId?.startsWith("item:")) return null;
    return itemMap.get(activeDragId.replace("item:", "")) ?? null;
  }, [activeDragId, itemMap]);

  const overlayAugment = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith("augment:")) {
      return augmentMap.get(activeDragId.slice("augment:".length)) ?? null;
    }
    if (activeDragId.startsWith("slotaug:")) {
      const idx = parseInt(activeDragId.slice("slotaug:".length), 10);
      const api = augmentSlots[idx];
      return api ? (augmentMap.get(api) ?? null) : null;
    }
    return null;
  }, [activeDragId, augmentMap, augmentSlots]);

  const isDraggingFromPanel = !!activeDragId?.startsWith("champion:");
  const isDraggingFromBoard = !!activeDragId?.startsWith("hex:");
  const isDraggingItem = !!activeDragId?.startsWith("item:");
  const isDraggingAugment =
    !!activeDragId?.startsWith("augment:") || !!activeDragId?.startsWith("slotaug:");
  const isDraggingFromSlot = !!activeDragId?.startsWith("slotaug:");

  const [poolTab, setPoolTab] = useState<PoolTab>("champions");

  const { isOver: isTrashOver, setNodeRef: setTrashRef } = useDroppable({ id: "panel:trash" });

  // Header summary
  const unitCount = step.units.length;
  const previewNames = step.units
    .slice(0, 3)
    .map((u) => championMap.get(u.championKey)?.name ?? u.championKey)
    .join(", ");

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-card/50 backdrop-blur-sm">
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-muted/20 transition-colors",
          isExpanded && "border-b border-border/50",
        )}
        onClick={onToggleExpand}
      >
        <span className="shrink-0 text-muted-foreground/60">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{step.title}</span>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 shrink-0 border-white/10 text-muted-foreground"
            >
              {STEP_TYPE_LABELS[step.stepType]}
            </Badge>
            <span className="text-xs text-muted-foreground/60 shrink-0">Lv{step.level}</span>
          </div>
          {!isExpanded && unitCount > 0 && (
            <p className="text-xs text-muted-foreground/50 mt-0.5 truncate">
              {unitCount} unit{unitCount !== 1 ? "s" : ""}
              {previewNames ? ` — ${previewNames}${unitCount > 3 ? "…" : ""}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-foreground"
            onClick={() => onDuplicate(step.id)}
            title="Duplicate step"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive/60 hover:text-destructive"
                title="Delete step"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{step.title}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This board step will be removed permanently after saving.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRemove(step.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Metadata — each input owns its own draft state so a keystroke
              never re-renders the heavy board/pool/items subtree below. */}
          <div className="grid sm:grid-cols-3 gap-3">
            <StepTitleField initialTitle={step.title} onCommit={commitTitle} />
            <StepLevelField initialLevel={step.level} onCommit={commitLevel} />
            <StepTypeField stepType={step.stepType} onCommit={commitStepType} />
          </div>

          <StepNotesField initialDescription={step.description} onCommit={commitNotes} />

          {/* Board + panels */}
          <DndContext
            sensors={sensors}
            collisionDetection={dragCollisionDetection}
            modifiers={[snapCenterToCursor]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Board</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground/60 hover:text-muted-foreground gap-1"
                  disabled={unitCount === 0}
                  onClick={handleCopyPlannerCode}
                >
                  <Link className="h-3 w-3" />
                  Copy planner code
                </Button>
              </div>
              <div className="flex items-start justify-center gap-2 overflow-x-auto">
                <TraitsPanel units={step.units} />
                <div ref={boardContainerRef} className="rounded-lg shrink-0">
                  <BoardGrid
                    units={step.units}
                    selectedPos={selectedPos}
                    onHexClick={handleHexClick}
                    onSetStarLevel={handleSetStarLevel}
                    onRemoveItem={handleRemoveItem}
                    isDraggingFromPanel={isDraggingFromPanel}
                    isDraggingItem={isDraggingItem}
                  />
                </div>
                <AugmentSlotsPanel slots={augmentSlots} isDraggingAugment={isDraggingAugment} />
              </div>
            </div>

            <div
              ref={setTrashRef}
              className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 pt-1 border-t border-border/40"
            >
              <PoolPanel
                activeTab={poolTab}
                onTabChange={setPoolTab}
                onChampionClick={placeChampionAtFirstEmpty}
                isRemoveTarget={isDraggingFromBoard || isDraggingFromSlot}
                isOver={isTrashOver}
              />
              <div className="rounded-xl p-3 border border-white/5 bg-background/30">
                <ItemsPanel />
              </div>
            </div>

            {typeof document !== "undefined" &&
              createPortal(
                <DragOverlay dropAnimation={null}>
                  {overlayChampion && <DragOverlayContent champion={overlayChampion} />}
                  {overlayItem && <ItemDragOverlay item={overlayItem} />}
                  {overlayAugment && <AugmentDragOverlay augment={overlayAugment} />}
                </DragOverlay>,
                document.body,
              )}
          </DndContext>
        </div>
      )}
    </div>
  );
}

export const BoardStepCard = memo(BoardStepCardImpl);
