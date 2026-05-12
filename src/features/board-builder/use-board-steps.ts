import { useState } from "react";
import type { BoardStep } from "./types";

export function useBoardSteps() {
  const [steps, setSteps] = useState<BoardStep[]>([]);

  function addStep(): string {
    const newId = crypto.randomUUID();
    const newStep: BoardStep = {
      id: newId,
      title: "New board",
      level: 6,
      stepType: "early",
      description: "",
      units: [],
      sortOrder: steps.length,
    };
    setSteps((prev) => [...prev, newStep]);
    return newId;
  }

  function updateStep(id: string, patch: Partial<BoardStep>) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  function removeStep(id: string) {
    setSteps((prev) =>
      prev
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, sortOrder: i }))
    );
  }

  function duplicateStep(id: string) {
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
  }

  function moveStepUp(id: string) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
  }

  function moveStepDown(id: string) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
  }

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
