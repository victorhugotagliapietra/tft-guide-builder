import { z } from "zod";
import type { BoardStep } from "@/features/board-builder/types";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const newGuideSchema = z.object({
  title: z.string().min(1, "Title is required").max(120, "Title must be 120 characters or fewer"),
});

export const guideFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  description: z.string().max(1000).default(""),
  tft_set: z.string().max(20).default(""),
  patch: z.string().max(20).default(""),
  playstyle: z.string().max(60).default(""),
  difficulty: z.enum(DIFFICULTIES).default("medium"),
  final_comp_notes: z.string().max(5000).default(""),
  is_public: z.boolean().default(false),
});

export type GuideFormValues = z.infer<typeof guideFormSchema>;

export type GuideRow = {
  id: string;
  author_id: string;
  slug: string;
  title: string;
  description: string;
  tft_set: string;
  patch: string;
  playstyle: string;
  difficulty: Difficulty;
  final_comp_notes: string;
  is_public: boolean;
  board_steps: BoardStep[];
  created_at: string;
  updated_at: string;
};

export type GuideSummary = Pick<
  GuideRow,
  "id" | "slug" | "title" | "description" | "tft_set" | "patch" | "difficulty" | "is_public" | "updated_at"
>;
