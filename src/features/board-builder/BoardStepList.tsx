import { useState } from "react";
import { Plus, LayoutList } from "lucide-react";
import type { BoardStep } from "./types";
import { BoardStepCard } from "./BoardStepCard";
import { Button } from "@/components/ui/button";

type Props = {
  steps: BoardStep[];
  onAdd: () => string;
  onUpdate: (id: string, patch: Partial<BoardStep>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
};

export function BoardStepList({
  steps,
  onAdd,
  onUpdate,
  onRemove,
  onDuplicate,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleAdd() {
    const newId = onAdd();
    setExpandedId(newId);
  }

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-3">
      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <LayoutList className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            No board steps yet. Add one to show the progression of your comp.
          </p>
          <Button type="button" size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add first board step
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {steps.map((step) => (
              <BoardStepCard
                key={step.id}
                step={step}
                isExpanded={expandedId === step.id}
                onToggleExpand={() => toggle(step.id)}
                onUpdate={onUpdate}
                onRemove={(id) => {
                  if (expandedId === id) setExpandedId(null);
                  onRemove(id);
                }}
                onDuplicate={onDuplicate}
              />
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add board step
          </Button>
        </>
      )}
    </div>
  );
}
