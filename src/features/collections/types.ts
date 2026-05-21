import { z } from "zod";
import type { GuideSummary } from "@/features/guides/types";

// Title is short and required; description is optional with a high cap so
// creators can use it as a paragraph-long pitch on the collection page.
export const collectionFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(80, "Title must be 80 characters or fewer"),
  description: z.string().max(2000).default(""),
  is_public: z.boolean().default(false),
});

export type CollectionFormValues = z.infer<typeof collectionFormSchema>;

export const newCollectionSchema = z.object({
  title: z.string().min(1, "Title is required").max(80),
});

export type CollectionRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type CollectionSummary = Pick<
  CollectionRow,
  "id" | "title" | "description" | "is_public" | "updated_at"
> & {
  // Count is derived from a relational aggregate against the
  // collection_guides junction, not stored on the row itself.
  guide_count: number;
};

// Full collection viewed on the public collection page, including hydrated
// guide summaries in display order (public-only for anonymous viewers).
export type CollectionWithGuides = CollectionRow & {
  guides: GuideSummary[];
  owner: { username: string | null; display_name: string | null; avatar_url: string | null };
};

// Username constraints are mirrored from the database CHECK constraint
// (profiles_username_format) so the form validates before round-tripping.
export const USERNAME_REGEX = /^[a-z0-9_-]{3,32}$/;

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be 32 characters or fewer")
  .regex(USERNAME_REGEX, "Lowercase letters, numbers, dashes and underscores only");

export const profileFormSchema = z.object({
  username: usernameSchema,
  display_name: z.string().min(1, "Display name is required").max(60),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
