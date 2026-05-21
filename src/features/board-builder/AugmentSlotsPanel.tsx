import { memo } from "react";
import { Sparkles } from "lucide-react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTAugment, TFTAugmentTier } from "@/features/tft-data/types";
import { AugmentIcon } from "./AugmentsPanel";
import type { AugmentSlots } from "./types";
import { AUGMENT_SLOT_COUNT } from "./types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// AugmentSlotsPanel — droppable augment slots arranged in a 2-column grid
// (rows = AUGMENT_SLOT_COUNT / 2, currently 3). Each slot:
//   - Empty:    droppable target with `augslot:<index>` id
//   - Filled:   shows the assigned augment icon, draggable as `slotaug:<index>`
//   - Hovered while a `augment:*` / `slotaug:*` drag is in flight: highlights
//
// Title is centered relative to the overall panel (which spans both columns).
// The 50%-larger slot footprint (72px) and rounded-lg style are preserved.
// ---------------------------------------------------------------------------

// Visual tier rings — same palette family as AugmentsPanel for consistency.
const TIER_RING: Record<TFTAugmentTier, string> = {
  silver: "ring-slate-400/55",
  gold: "ring-yellow-500/65 shadow-[0_0_6px_-2px_rgba(250,204,21,0.45)]",
  prismatic: "ring-fuchsia-400/65 shadow-[0_0_8px_-2px_rgba(232,121,249,0.55)]",
};

// Thin shim around AugmentIcon (from AugmentsPanel) so assigned augments use
// exactly the same URL fallback chain + name-placeholder behavior as the
// pickable tiles. Keeps the visual identical whether an augment is in the
// pool or in a slot.
function AugmentSlotIcon({ augment }: { augment: TFTAugment }) {
  return <AugmentIcon augment={augment} className="w-full h-full" />;
}

// Draggable wrapper for an assigned augment — lets the user swap or remove.
function DraggableAssignedAugment({ index, augment }: { index: number; augment: TFTAugment }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slotaug:${index}`,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none" }}
      title={augment.name}
      className={cn(
        "absolute inset-0 rounded-lg overflow-hidden ring-2 cursor-grab active:cursor-grabbing select-none",
        TIER_RING[augment.tier],
        isDragging && "opacity-30",
      )}
    >
      <AugmentSlotIcon augment={augment} />
    </div>
  );
}

// One slot — droppable always, shows assigned augment if present.
function AugmentSlot({
  index,
  augmentApiName,
  isDraggingAugment,
}: {
  index: number;
  augmentApiName: string | null;
  isDraggingAugment: boolean;
}) {
  const { augmentMap } = useTFTData();
  const augment = augmentApiName ? augmentMap.get(augmentApiName) : null;
  const { isOver, setNodeRef } = useDroppable({ id: `augslot:${index}` });

  return (
    <div
      ref={setNodeRef}
      data-augment-index={index}
      className={cn(
        "relative w-[72px] h-[72px] rounded-lg transition-colors",
        // Empty-slot frame: dashed outline.
        !augment && "border border-dashed border-white/15 bg-background/30",
        !augment && isDraggingAugment && "border-primary/40 bg-primary/5",
        // Drop-target highlight while an augment is hovering this slot.
        isOver && isDraggingAugment && "ring-2 ring-primary/70",
      )}
      title={augment ? augment.name : `Augment slot ${index + 1}`}
      aria-label={
        augment ? `${augment.name} (slot ${index + 1})` : `Empty augment slot ${index + 1}`
      }
    >
      {/* Empty placeholder icon */}
      {!augment && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-muted-foreground/25" />
        </div>
      )}
      {/* Assigned augment — draggable. Rendered above the empty frame so the
          ring sits exactly over the slot footprint regardless of its source. */}
      {augment && <DraggableAssignedAugment index={index} augment={augment} />}
    </div>
  );
}

type Props = {
  slots: AugmentSlots;
  isDraggingAugment: boolean;
};

// ---------------------------------------------------------------------------
// ReadOnlyAugmentSlotsPanel — view-only sibling used by the public guide
// route. Renders the SAME 2-col grid layout, tier-ring styling, and
// AugmentIcon resolution as the editable panel, but skips every dnd-kit
// hook so it can mount outside a DndContext. Empty slots are dimmed (not
// fully hidden) so the panel still reads as "this guide step has N of 6
// augments planned".
// ---------------------------------------------------------------------------

export function ReadOnlyAugmentSlotsPanel({ slots }: { slots: AugmentSlots }) {
  const { augmentMap } = useTFTData();
  // Hide the whole panel when no augments are assigned — keeps the viewer
  // visually clean for guides that don't use the augment system.
  const hasAny = slots.some((s) => !!s);
  if (!hasAny) return null;

  return (
    <div className="shrink-0 flex flex-col gap-1.5 self-start">
      <span className="text-[10px] font-semibold text-foreground/70 tracking-wider uppercase text-center">
        Augments
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        {Array.from({ length: AUGMENT_SLOT_COUNT }, (_, i) => {
          const apiName = slots[i] ?? null;
          const augment = apiName ? augmentMap.get(apiName) : null;
          return (
            <div
              key={i}
              className={cn(
                "relative w-[72px] h-[72px] rounded-lg",
                // Empty slot in read-only mode: faint outline, no dashed
                // border (less visual noise than the editor's "this is a
                // drop target" treatment).
                !augment && "border border-white/[0.06] bg-background/20",
              )}
              title={augment?.name ?? ""}
              aria-label={augment ? augment.name : `Empty augment slot ${i + 1}`}
            >
              {augment ? (
                <div
                  className={cn(
                    "absolute inset-0 rounded-lg overflow-hidden ring-2",
                    TIER_RING[augment.tier],
                  )}
                >
                  <AugmentSlotIcon augment={augment} />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-muted-foreground/15" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadOnlyAugmentRow — single horizontal strip used by the public guide
// viewer. Renders only the slots that have an augment assigned (empty slots
// are skipped entirely so the strip stays compact), each as an icon tile
// plus the augment name beneath. Uses the same AugmentIcon + tier-ring
// vocabulary as the editor so visuals stay consistent.
//
// Behavior:
//   - flex-nowrap + overflow-x-auto: the row stays on a single line as the
//     spec requires; if the viewport is too narrow to host all assigned
//     augments + names, the row scrolls horizontally instead of wrapping.
//   - justify-center: groups of augments that fit comfortably center over
//     the board below; only longer strips that exceed the container width
//     fall back to a left-anchored scroll position.
//   - Returns null when no slots are assigned — keeps the surrounding
//     vertical rhythm tight for guides that don't use augments.
// ---------------------------------------------------------------------------

export function ReadOnlyAugmentRow({ slots }: { slots: AugmentSlots }) {
  const { augmentMap } = useTFTData();
  const assigned: { apiName: string; index: number }[] = [];
  for (let i = 0; i < slots.length; i++) {
    const api = slots[i];
    if (api) assigned.push({ apiName: api, index: i });
  }
  if (assigned.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-nowrap items-start justify-center gap-3 px-2 py-1",
        "overflow-x-auto",
        "[&::-webkit-scrollbar]:h-1",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full",
        "[&::-webkit-scrollbar-thumb]:bg-white/10",
      )}
      aria-label="Augments used in this board step"
    >
      {assigned.map(({ apiName, index }) => {
        const augment = augmentMap.get(apiName);
        if (!augment) return null;
        return (
          <div
            key={index}
            className="flex flex-col items-center gap-1 w-20 shrink-0"
            title={augment.name}
          >
            <div
              className={cn("w-12 h-12 rounded-md overflow-hidden ring-2", TIER_RING[augment.tier])}
            >
              <AugmentSlotIcon augment={augment} />
            </div>
            <span className="text-[10px] leading-tight text-center text-foreground/85 line-clamp-2">
              {augment.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AugmentSlotsPanelImpl({ slots, isDraggingAugment }: Props) {
  // 2-column grid (rows derived from AUGMENT_SLOT_COUNT). Title sits above the
  // grid and is center-aligned across the grid's full width — visually it lands
  // over the seam between the two columns, which reads as "centered above the
  // panel" and "above the second column" at the same time for a 2-col grid.
  //
  // No negative margin: the parent layout in BoardStepCard now sizes the
  // board to its natural width and centers the trio (traits | board | augments)
  // with justify-center + gap-2, so this panel naturally sits 8px to the right
  // of the board's actual right edge without any margin hacks.
  return (
    <div className="shrink-0 flex flex-col gap-1.5 self-start">
      <span className="text-[10px] font-semibold text-foreground/70 tracking-wider uppercase text-center">
        Augments
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        {Array.from({ length: AUGMENT_SLOT_COUNT }, (_, i) => (
          <AugmentSlot
            key={i}
            index={i}
            augmentApiName={slots[i] ?? null}
            isDraggingAugment={isDraggingAugment}
          />
        ))}
      </div>
    </div>
  );
}

export const AugmentSlotsPanel = memo(AugmentSlotsPanelImpl);
