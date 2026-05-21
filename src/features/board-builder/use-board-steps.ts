import { useCallback, useState } from "react";
import type { BoardStep } from "./types";
import { emptyAugmentSlots } from "./types";

export function useBoardSteps() {
  const [steps, setSteps] = useState<BoardStep[]>([]);

  // All mutator callbacks are wrapped in useCallback with empty deps so they
  // keep a stable identity across re-renders. The setter form of setState is
  // used everywhere so we never need to read `steps` in the closure — which
  // is what would otherwise force the deps array to include `steps` (and
  // bust BoardStepList's memo on every keystroke).

  const addStep = useCallback((): string => {
    const newId = crypto.randomUUID();
    setSteps((prev) => {
      const newStep: BoardStep = {
        id: newId,
        title: "New board",
        level: 6,
        stepType: "early",
        description: "",
        units: [],
        augments: emptyAugmentSlots(),
        sortOrder: prev.length,
      };
      return [...prev, newStep];
    });
    return newId;
  }, []);

  const updateStep = useCallback((id: string, patch: Partial<BoardStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, sortOrder: i })));
  }, []);

  const duplicateStep = useCallback((id: string) => {
    setSteps((prev) => {
      const source = prev.find((s) => s.id === id);
      if (!source) return prev;
      const copy: BoardStep = {
        ...source,
        id: crypto.randomUUID(),
        title: `${source.title} (copy)`,
        sortOrder: prev.length,
      };
      return [...prev, copy];
    });
  }, []);

  const moveStepUp = useCallback((id: string) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
  }, []);

  const moveStepDown = useCallback((id: string) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
  }, []);

  return {
    steps,
    setSteps,
    addStep,
    updateStep,
    removeStep,
    duplicateStep,
    moveStepUp,
    moveStepDown,
  };
}
