import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// AugmentSlotsPanel — 6 placeholder slots in a 2-row × 3-col grid.
// Each slot is 72px × 72px (50% larger than the previous 48px baseline).
// Slots carry a stable `data-augment-index` so a future PR can wire them
// into the dnd-kit flow without restructuring the layout.
// ---------------------------------------------------------------------------

const SLOT_COUNT = 6;

function AugmentSlot({ index }: { index: number }) {
  return (
    <div
      data-augment-index={index}
      className={cn(
        "w-[72px] h-[72px] rounded-lg border border-dashed border-white/15 bg-background/30",
        "flex items-center justify-center transition-colors",
        "hover:border-white/30 hover:bg-background/50"
      )}
      title={`Augment slot ${index + 1}`}
      aria-label={`Augment slot ${index + 1}`}
    >
      <Sparkles className="w-5 h-5 text-muted-foreground/25" />
    </div>
  );
}

export function AugmentSlotsPanel() {
  return (
    <div className="shrink-0 flex flex-col gap-1.5 self-start">
      <div className="px-0.5">
        <span className="text-[10px] font-semibold text-foreground/70 tracking-wider uppercase">
          Augments
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: SLOT_COUNT }, (_, i) => (
          <AugmentSlot key={i} index={i} />
        ))}
      </div>
    </div>
  );
}
