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
  starLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  isCarry: z.boolean().default(false),
  isItemHolder: z.boolean().default(false),
});

export type BoardUnit = z.infer<typeof boardUnitSchema>;

export const boardStepSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  level: z.number().int().min(1).max(11),
  stepType: z.enum(STEP_TYPES).default("early"),
  description: z.string().max(2000).default(""),
  units: z.array(boardUnitSchema).default([]),
  sortOrder: z.number().int(),
});

export type BoardStep = z.infer<typeof boardStepSchema>;
