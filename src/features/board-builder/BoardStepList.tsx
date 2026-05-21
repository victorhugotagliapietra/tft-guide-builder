import { memo, useCallback, useState } from "react";
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

// Lightweight wrapper for each row — its only job is to bind the parent's
// toggle/remove handlers to a specific step id BEFORE passing them down to
// the memoized BoardStepCard, so each card receives stable function props.
// Without this wrapper, building inline closures inline (() => toggle(id))
// in the parent's .map would defeat BoardStepCard's React.memo for every row
// whenever ANY row's content changed.
const BoardStepListItem = memo(function BoardStepListItem({
  step,
  isExpanded,
  onToggleExpand,
  onRemove,
  onUpdate,
  onDuplicate,
}: {
  step: BoardStep;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<BoardStep>) => void;
  onDuplicate: (id: string) => void;
}) {
  return (
    <BoardStepCard
      step={step}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onDuplicate={onDuplicate}
    />
  );
});

export function BoardStepList({
  steps,
  onAdd,
  onUpdate,
  onRemove,
  onDuplicate,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    const newId = onAdd();
    setExpandedId(newId);
  }, [onAdd]);

  // Wrap remove so we collapse the expanded row when it's the one being deleted.
  // Stable identity across renders so BoardStepListItem's memo holds.
  const handleRemove = useCallback(
    (id: string) => {
      setExpandedId((prev) => (prev === id ? null : prev));
      onRemove(id);
    },
    [onRemove]
  );

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
              <Row
                key={step.id}
                step={step}
                isExpanded={expandedId === step.id}
                onExpand={setExpandedId}
                onRemove={handleRemove}
                onUpdate={onUpdate}
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

// Each Row owns a stable `onToggleExpand` callback bound to its own step.id
// so the memoized BoardStepCard inside receives a stable function prop. This
// is the missing piece that makes BoardStepCard's React.memo actually
// effective when sibling rows expand/collapse.
const Row = memo(function Row({
  step,
  isExpanded,
  onExpand,
  onRemove,
  onUpdate,
  onDuplicate,
}: {
  step: BoardStep;
  isExpanded: boolean;
  onExpand: (id: string | null) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<BoardStep>) => void;
  onDuplicate: (id: string) => void;
}) {
  const handleToggle = useCallback(() => {
    onExpand(isExpanded ? null : step.id);
  }, [isExpanded, onExpand, step.id]);

  return (
    <BoardStepListItem
      step={step}
      isExpanded={isExpanded}
      onToggleExpand={handleToggle}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onDuplicate={onDuplicate}
    />
  );
});
