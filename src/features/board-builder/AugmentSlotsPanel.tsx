import { useState, useEffect } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { Sparkles } from "lucide-react";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import type { TFTAugment, TFTAugmentTier } from "@/features/tft-data/types";
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
  silver:    "ring-slate-400/55",
  gold:      "ring-yellow-500/65 shadow-[0_0_6px_-2px_rgba(250,204,21,0.45)]",
  prismatic: "ring-fuchsia-400/65 shadow-[0_0_8px_-2px_rgba(232,121,249,0.55)]",
};

function AugmentSlotIcon({ augment }: { augment: TFTAugment }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [augment.icon]);

  if (!augment.icon || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/40 text-[8px] text-muted-foreground text-center leading-tight px-0.5">
        {augment.name.slice(0, 8)}
      </div>
    );
  }
  return (
    <img
      src={augment.icon}
      alt={augment.name}
      className="w-full h-full object-cover"
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// Draggable wrapper for an assigned augment — lets the user swap or remove.
function DraggableAssignedAugment({
  index,
  augment,
}: {
  index: number;
  augment: TFTAugment;
}) {
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
        isDragging && "opacity-30"
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
        isOver && isDraggingAugment && "ring-2 ring-primary/70"
      )}
      title={augment ? augment.name : `Augment slot ${index + 1}`}
      aria-label={augment ? `${augment.name} (slot ${index + 1})` : `Empty augment slot ${index + 1}`}
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

export function AugmentSlotsPanel({ slots, isDraggingAugment }: Props) {
  // 2-column grid (rows derived from AUGMENT_SLOT_COUNT). Title sits above the
  // grid and is center-aligned across the grid's full width — visually it lands
  // over the seam between the two columns, which reads as "centered above the
  // panel" and "above the second column" at the same time for a 2-col grid.
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
