import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { GuideCard } from "@/features/guides/GuideCard";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GuideSummary } from "@/features/guides/types";

type ViewModel = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  is_public: boolean;
  owner: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
  guides: GuideSummary[];
};

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ok"; view: ViewModel; isOwner: boolean };

export const Route = createFileRoute("/collection/$id")({
  component: CollectionPage,
});

/**
 * Public-facing collection page.
 *
 * Visibility flow:
 *   - Public collection → render to anyone.
 *   - Private collection + signed-in owner → render (so owner can preview
 *     the page before publishing).
 *   - Private collection + anyone else → SECURITY DEFINER RPC tells us the
 *     owner's username, then we redirect to /profile/<username>. Falls
 *     back to "/" if the owner has no username (shouldn't happen since the
 *     onboarding gate forces one before a collection can be created).
 *   - Nonexistent ID → "missing" state with a link home.
 *
 * Guide listing comes from the `collection_guides` junction joined to the
 * guides table. Membership is many-to-many (a guide can live in any number
 * of folders), and the junction's `position` column drives display order
 * within this folder. RLS hides drafts from non-owner viewers automatically;
 * the explicit `is_public` filter on the client is defense in depth and
 * keeps draft IDs out of anonymous viewers' network responses.
 */
function CollectionPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      const { data: collection, error } = await supabase
        .from("collections")
        .select("id, owner_id, title, description, is_public")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;

      // No row returned. Two possibilities:
      //   a) The collection doesn't exist at all → show "missing".
      //   b) It exists but RLS hid it from this viewer → redirect via RPC.
      if (error || !collection) {
        const { data: redirectInfo } = await supabase.rpc("collection_redirect_info", {
          p_id: id,
        });
        const info = redirectInfo?.[0];
        if (info?.exists_flag && info.owner_username) {
          navigate({
            to: "/profile/$username",
            params: { username: info.owner_username },
            replace: true,
          });
          return;
        }
        setState({ status: "missing" });
        return;
      }

      const isOwner = !!user && user.id === collection.owner_id;

      // Fetch owner profile + ordered junction rows in parallel. Junction
      // rows give us the ordered guide ids; the actual guide rows come from
      // a second query that RLS filters automatically (drafts hidden to
      // non-owner viewers). This two-step is intentional: a single relational
      // embed would require the `guides` FK to point at the junction, and
      // the membership table is the source of truth for ordering.
      const [ownerRes, junctionRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", collection.owner_id)
          .maybeSingle(),
        supabase
          .from("collection_guides")
          .select("guide_id, position")
          .eq("collection_id", id)
          .order("position", { ascending: true }),
      ]);
      if (cancelled) return;

      const positionByGuide = new Map(
        (junctionRes.data ?? []).map((r) => [r.guide_id, r.position])
      );
      const guideIds = Array.from(positionByGuide.keys());

      let guides: GuideSummary[] = [];
      if (guideIds.length > 0) {
        const q = supabase
          .from("guides")
          .select(
            "id, slug, title, description, tft_set, patch, difficulty, is_public, updated_at"
          )
          .in("id", guideIds);
        const { data: guideRows } = isOwner ? await q : await q.eq("is_public", true);
        if (cancelled) return;
        guides = ((guideRows as GuideSummary[]) ?? []).sort(
          (a, b) =>
            (positionByGuide.get(a.id) ?? 0) - (positionByGuide.get(b.id) ?? 0)
        );
      }

      setState({
        status: "ok",
        isOwner,
        view: {
          id: collection.id,
          owner_id: collection.owner_id,
          title: collection.title,
          description: collection.description,
          is_public: collection.is_public,
          owner: ownerRes.data ?? null,
          guides,
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user, authLoading, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {state.status === "loading" && (
          <div className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">Loading…</div>
        )}

        {state.status === "missing" && (
          <div className="mx-auto max-w-5xl px-4 py-16 text-center">
            <h1 className="text-2xl font-semibold">Collection not found</h1>
            <Link to="/" className="text-primary hover:underline inline-block mt-4">
              ← Browse guides
            </Link>
          </div>
        )}

        {state.status === "ok" && <Body view={state.view} isOwner={state.isOwner} />}
      </main>
    </div>
  );
}

function Body({ view, isOwner }: { view: ViewModel; isOwner: boolean }) {
  const ownerName = view.owner?.display_name ?? view.owner?.username ?? "Unknown";
  const ownerInitial = (ownerName[0] ?? "?").toUpperCase();
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold leading-tight [overflow-wrap:anywhere]">
                {view.title}
              </h1>
              {view.description && (
                <p className="text-muted-foreground mt-3 whitespace-pre-wrap max-w-3xl [overflow-wrap:anywhere]">
                  {view.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!view.is_public && (
                <Badge variant="secondary">Draft (only you can see this)</Badge>
              )}
              {view.is_public && (
                <CopyLinkButton
                  href={`/collection/${view.id}`}
                  variant="outline"
                  stopPropagation={false}
                />
              )}
              {isOwner && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/collections/$id/edit" params={{ id: view.id }}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Link>
                </Button>
              )}
            </div>
          </div>
          {view.owner?.username && (
            <Link
              to="/profile/$username"
              params={{ username: view.owner.username }}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Avatar className="h-7 w-7">
                {view.owner.avatar_url && (
                  <AvatarImage src={view.owner.avatar_url} alt={ownerName} />
                )}
                <AvatarFallback>{ownerInitial}</AvatarFallback>
              </Avatar>
              <span>
                by <span className="font-medium text-foreground">{ownerName}</span>
              </span>
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        {view.guides.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "This collection is empty. Open any of your guides and pick this collection from the dropdown to add it here."
              : "No published guides in this collection yet."}
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {view.guides.map((g) => (
              <GuideCard key={g.id} guide={g} variant="public" />
            ))}
          </div>
        )}
      </section>

      {!isOwner && (
        <div className="mx-auto max-w-5xl px-4 pb-12">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back to all guides
          </Link>
        </div>
      )}
    </>
  );
}
