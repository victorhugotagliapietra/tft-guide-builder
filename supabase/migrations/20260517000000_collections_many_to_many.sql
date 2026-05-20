-- Restore the many-to-many membership model for guides ↔ collections.
--
-- The previous migration locked guides into a single collection via a
-- `collection_id` FK on the guides table. The product spec evolved to
-- "a guide can live in more than one collection" — so we bring back the
-- junction (collection_guides) and drop the single-FK columns.
--
-- Membership is now expressed by ROWS in collection_guides: one row per
-- (collection, guide) pair, with a per-collection `position` for ordering
-- inside each folder.

-- ---------- RE-CREATE JUNCTION ----------

CREATE TABLE IF NOT EXISTS public.collection_guides (
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, guide_id)
);

CREATE INDEX IF NOT EXISTS collection_guides_collection_idx
  ON public.collection_guides(collection_id, position);
CREATE INDEX IF NOT EXISTS collection_guides_guide_idx
  ON public.collection_guides(guide_id);

ALTER TABLE public.collection_guides ENABLE ROW LEVEL SECURITY;

-- Junction-row visibility derives from the parent collection: if a viewer
-- can read the collection (public OR owner), they can enumerate its
-- membership rows. Drafts inside a public collection are still hidden via
-- the guides RLS layer.
DROP POLICY IF EXISTS "Junction rows visible when parent collection is"
  ON public.collection_guides;
CREATE POLICY "Junction rows visible when parent collection is"
  ON public.collection_guides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_id
        AND (c.is_public OR c.owner_id = auth.uid())
    )
  );

-- Only the collection's owner may add/remove rows. The sub-SELECT also
-- guards the WITH CHECK side so a malicious INSERT targeting someone
-- else's collection is rejected before it lands.
DROP POLICY IF EXISTS "Owners manage their collection contents"
  ON public.collection_guides;
CREATE POLICY "Owners manage their collection contents"
  ON public.collection_guides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_id AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_id AND c.owner_id = auth.uid()
    )
  );

-- ---------- BACKFILL FROM guides.collection_id ----------

-- Copy whatever single assignments exist on the guides table into the
-- junction. ON CONFLICT DO NOTHING is a guard for re-running this
-- migration after a partial apply — the PRIMARY KEY would otherwise raise.
INSERT INTO public.collection_guides (collection_id, guide_id, position)
SELECT g.collection_id, g.id, COALESCE(g.collection_position, 0)
FROM public.guides g
WHERE g.collection_id IS NOT NULL
ON CONFLICT (collection_id, guide_id) DO NOTHING;

-- ---------- DROP THE SINGLE-FK COLUMNS ----------

DROP INDEX IF EXISTS guides_collection_idx;
ALTER TABLE public.guides DROP COLUMN IF EXISTS collection_id;
ALTER TABLE public.guides DROP COLUMN IF EXISTS collection_position;
