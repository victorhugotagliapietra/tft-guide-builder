import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Folders, Globe, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CollectionListItem = {
  id: string;
  title: string;
  description: string;
  is_public: boolean;
  guide_count: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; items: CollectionListItem[] };

export const Route = createFileRoute("/_authenticated/collections")({
  component: CollectionsList,
});

/**
 * Owner-facing list of all collections (drafts AND published). Visually
 * mirrors the dashboard so creators can navigate between guides and
 * collections without re-learning the UI.
 */
function CollectionsList() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Count of guides per collection comes back as a relational aggregate.
      // The Supabase client returns it as `collection_guides: [{ count: N }]`
      // because we asked for a relational count rather than scalar.
      const { data, error } = await supabase
        .from("collections")
        .select("id, title, description, is_public, collection_guides(count)")
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) {
        setState({ status: "error", message: error.message });
        return;
      }
      type Row = {
        id: string;
        title: string;
        description: string;
        is_public: boolean;
        collection_guides?: { count: number }[];
      };
      const items: CollectionListItem[] = ((data as Row[]) ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        is_public: r.is_public,
        guide_count: r.collection_guides?.[0]?.count ?? 0,
      }));
      setState({ status: "ok", items });
    })();
  }, [user]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Folders className="h-7 w-7" /> Your collections
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Group guides into shareable lists — "Beginner comps", "Patch 14.3 meta", etc.
          </p>
        </div>
        <Button asChild>
          <Link to="/collections/new">
            <Plus className="h-4 w-4 mr-1" /> New collection
          </Link>
        </Button>
      </div>

      {state.status === "loading" && <p className="text-muted-foreground">Loading…</p>}
      {state.status === "error" && (
        <p className="text-destructive text-sm">{state.message}</p>
      )}
      {state.status === "ok" && state.items.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">No collections yet.</p>
            <Button asChild>
              <Link to="/collections/new">Create your first collection</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {state.status === "ok" && state.items.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.items.map((c) => (
            <Link key={c.id} to="/collections/$id/edit" params={{ id: c.id }}>
              <Card className="hover:border-primary/50 transition-colors h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight">{c.title}</CardTitle>
                    {c.is_public ? (
                      <Badge variant="default" className="shrink-0">
                        <Globe className="h-3 w-3 mr-1" /> Public
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        <Lock className="h-3 w-3 mr-1" /> Draft
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline" className="self-start mt-1">
                    {c.guide_count} {c.guide_count === 1 ? "guide" : "guides"}
                  </Badge>
                </CardHeader>
                {c.description && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
