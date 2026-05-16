-- Migrate collections from many-to-many to strict "folders" (one collection
-- per guide). Each guide gains an optional `collection_id` FK and a
-- `collection_position` integer used for in-collection ordering. The
-- `collection_guides` junction is preserved long enough to backfill any
-- existing memberships, then dropped.
--
-- Why this changes: the original junction was implemented assuming guides
-- might be curated into multiple collections, but the product spec is
-- "folders of guides" — a single home per guide, picked from a dropdown
-- on the guide form. One-to-many makes that UX trivial and removes a
-- whole class of "in this collection but not that one" edge cases.

-- ---------- guides.collection_id ----------

ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS collection_id UUID
    REFERENCES public.collections(id)
    ON DELETE SET NULL;

ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS collection_position INTEGER NOT NULL DEFAULT 0;

-- Composite index supports the dominant collection-viewer query:
--   SELECT … FROM guides WHERE collection_id = $1 ORDER BY collection_position
-- The `collection_id IS NOT NULL` partial keeps the index small (most guides
-- start uncollected and shouldn't bloat the b-tree).
CREATE INDEX IF NOT EXISTS guides_collection_idx
  ON public.guides(collection_id, collection_position)
  WHERE collection_id IS NOT NULL;

-- ---------- BACKFILL FROM JUNCTION (if any rows exist) ----------

-- For every guide that has at least one junction row, claim the lowest-
-- positioned membership as its single collection. `DISTINCT ON` keeps one
-- row per guide_id and `ORDER BY` picks the smallest position deterministically.
UPDATE public.guides g
SET
  collection_id = cg.collection_id,
  collection_position = cg.position
FROM (
  SELECT DISTINCT ON (guide_id) guide_id, collection_id, position
  FROM public.collection_guides
  ORDER BY guide_id, position ASC, added_at ASC
) cg
WHERE cg.guide_id = g.id
  AND g.collection_id IS NULL;

-- ---------- DROP JUNCTION ----------

DROP TABLE IF EXISTS public.collection_guides;

-- ---------- TIGHTEN RLS ----------

-- The existing guides RLS policy ("Public guides are viewable by everyone")
-- already enforces the right visibility for collection viewers — a guide in
-- a public collection still has to be `is_public = true` for an anonymous
-- viewer to read it. No new policies needed here; we just leaned harder on
-- the policies that already existed.
