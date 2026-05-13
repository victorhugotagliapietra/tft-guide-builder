import { z } from "zod";

export const STEP_TYPES = [
  "early",
  "mid",
  "stabilization",
  "transition",
  "low-cost",
  "final",
  "capped",
  "alternative",
] as const;

export type StepType = (typeof STEP_TYPES)[number];

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  early: "Early game",
  mid: "Mid game",
  stabilization: "Stabilization",
  transition: "Transition",
  "low-cost": "Low-cost version",
  final: "Final board",
  capped: "Capped board",
  alternative: "Alternative board",
};

export const boardUnitSchema = z.object({
  id: z.string(),
  championKey: z.string(),
  position: z.number().int().min(0).max(27),
  items: z.array(z.string()).max(3).default([]),
  // 0 = no stars (hidden until hover), 1–3 = stars visible
  starLevel: z.number().int().min(0).max(3).default(0),
  isCarry: z.boolean().default(false),
  isItemHolder: z.boolean().default(false),
});

export type BoardUnit = z.infer<typeof boardUnitSchema>;

// Augment slot state: a fixed-length tuple of 4 entries.
// Each entry is either an augment apiName (assigned) or null (empty slot).
// Stored as a plain array so it serializes cleanly into the existing JSONB
// `board_steps` column without requiring a migration.
export const AUGMENT_SLOT_COUNT = 4;
export const augmentSlotsSchema = z
  .array(z.string().nullable())
  .length(AUGMENT_SLOT_COUNT)
  .default([null, null, null, null]);

export const boardStepSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  level: z.number().int().min(1).max(10),
  stepType: z.enum(STEP_TYPES).default("early"),
  // HTML content from TipTap rich text editor
  description: z.string().max(5000).default(""),
  units: z.array(boardUnitSchema).default([]),
  // 4-slot augment assignment — see augmentSlotsSchema for shape.
  augments: augmentSlotsSchema,
  sortOrder: z.number().int(),
});

export type BoardStep = z.infer<typeof boardStepSchema>;
export type AugmentSlots = z.infer<typeof augmentSlotsSchema>;

/** Build a fresh empty augment-slots array (always returns a new instance). */
export function emptyAugmentSlots(): AugmentSlots {
  return [null, null, null, null];
}
