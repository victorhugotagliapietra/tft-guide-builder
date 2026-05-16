-- Collections + profile-username system.
--
-- This migration adds:
--   1. `collections` (per-creator buckets of guides) + `collection_guides`
--      junction with ordering.
--   2. `username` UNIQUE constraint + format check on `profiles`. Username
--      stays nullable on insert so the post-signup onboarding flow can claim
--      it; the client refuses to render protected routes until it's set.
--   3. Two SECURITY DEFINER lookup RPCs that let anonymous viewers learn
--      "this guide/collection is private, redirect me to the creator's
--      profile" without exposing the full row through RLS.
--
-- Visibility model mirrors `guides`: a row is publicly readable iff
-- `is_public = true`; owners always see their own rows regardless.

-- ---------- COLLECTIONS ----------

CREATE TABLE public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX collections_owner_id_idx ON public.collections(owner_id);
CREATE INDEX collections_is_public_idx ON public.collections(is_public);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public collections are viewable by everyone"
  ON public.collections FOR SELECT
  USING (is_public OR auth.uid() = owner_id);

CREATE POLICY "Users can insert their own collections"
  ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own collections"
  ON public.collections FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own collections"
  ON public.collections FOR DELETE
  USING (auth.uid() = owner_id);

CREATE TRIGGER collections_set_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- COLLECTION ↔ GUIDES JUNCTION ----------

-- `position` is an integer sort key (smaller first). We don't auto-renumber
-- on remove — gaps are fine and reduce write amplification on reorder.
CREATE TABLE public.collection_guides (
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, guide_id)
);

CREATE INDEX collection_guides_collection_idx ON public.collection_guides(collection_id, position);
CREATE INDEX collection_guides_guide_idx ON public.collection_guides(guide_id);

ALTER TABLE public.collection_guides ENABLE ROW LEVEL SECURITY;

-- Junction-row visibility derives from the parent collection: if you can
-- read the collection (public or yours), you can read its membership rows.
CREATE POLICY "Junction rows visible when parent collection is"
  ON public.collection_guides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_id
        AND (c.is_public OR c.owner_id = auth.uid())
    )
  );

-- Only the collection's owner may modify its membership.
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

-- ---------- PROFILE USERNAME RULES ----------

-- Usernames are 3-32 chars, [a-z0-9-_] only, lowercase. Enforced here AND in
-- the client so a bad value can't slip through either layer.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9_-]{3,32}$');

-- NOTE: the original migration already declared `username TEXT UNIQUE` on
-- the column, which Postgres auto-names `profiles_username_key`. We don't
-- redeclare it here to avoid creating a redundant second unique index. A
-- user CAN have NULL username right after signup — the client gates them
-- through /onboarding to claim one before they can create guides or be
-- linked to a public profile URL.

-- ---------- REDIRECT-INFO RPCs ----------

-- Anonymous viewers calling `/g/<slug>` for an unpublished guide can't see
-- the row through RLS, so they have no way to know which profile to bounce
-- to. These SECURITY DEFINER functions return ONLY the minimum data needed
-- for the redirect — never the body, never the steps. Safe for anon.

CREATE OR REPLACE FUNCTION public.guide_redirect_info(p_slug TEXT)
RETURNS TABLE (
  exists_flag BOOLEAN,
  is_public BOOLEAN,
  author_username TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TRUE AS exists_flag,
    g.is_public,
    p.username AS author_username
  FROM public.guides g
  LEFT JOIN public.profiles p ON p.id = g.author_id
  WHERE g.slug = p_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.guide_redirect_info(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.collection_redirect_info(p_id UUID)
RETURNS TABLE (
  exists_flag BOOLEAN,
  is_public BOOLEAN,
  owner_username TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TRUE AS exists_flag,
    c.is_public,
    p.username AS owner_username
  FROM public.collections c
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  WHERE c.id = p_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.collection_redirect_info(UUID) TO anon, authenticated;

-- ---------- USERNAME AVAILABILITY HELPER ----------

-- Lets the onboarding/settings UI check "is this username taken?" without
-- a full SELECT round-trip and without exposing other profiles by username.
CREATE OR REPLACE FUNCTION public.is_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(p_username)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO anon, authenticated;
