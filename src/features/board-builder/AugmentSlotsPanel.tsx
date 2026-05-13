import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// AugmentSlotsPanel — placeholder slots for future drag-and-drop integration.
// Renders 4 empty slots in a single vertical column. Each slot has a stable
// `data-augment-index` and predictable class shape so a future PR can wire
// it into the existing dnd-kit flow without restructuring the layout.
// ---------------------------------------------------------------------------

const SLOT_COUNT = 4;

function AugmentSlot({ index }: { index: number }) {
  return (
    <div
      data-augment-index={index}
      className={cn(
        "w-12 h-12 rounded-lg border border-dashed border-white/15 bg-background/30",
        "flex items-center justify-center transition-colors",
        "hover:border-white/30 hover:bg-background/50"
      )}
      title={`Augment slot ${index + 1}`}
      aria-label={`Augment slot ${index + 1}`}
    >
      <Sparkles className="w-3.5 h-3.5 text-muted-foreground/30" />
    </div>
  );
}

export function AugmentSlotsPanel() {
  return (
    <div className="w-12 shrink-0 flex flex-col gap-1.5 self-start">
      <div className="px-0.5">
        <span className="text-[10px] font-semibold text-foreground/70 tracking-wider uppercase">
          Aug
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: SLOT_COUNT }, (_, i) => (
          <AugmentSlot key={i} index={i} />
        ))}
      </div>
    </div>
  );
}
