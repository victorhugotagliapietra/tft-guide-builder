import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Globe, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type GuideRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  tft_set: string;
  patch: string;
  difficulty: "easy" | "medium" | "hard";
  is_public: boolean;
  updated_at: string;
};

function Dashboard() {
  const { user } = useAuth();
  const [guides, setGuides] = useState<GuideRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("guides")
      .select("id, slug, title, description, tft_set, patch, difficulty, is_public, updated_at")
      .eq("author_id", user.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => setGuides((data as GuideRow[]) ?? []));
  }, [user]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold">Your guides</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Drafts and published comps you've created.
          </p>
        </div>
        <Button asChild>
          <Link to="/guides/new">
            <Plus className="h-4 w-4 mr-1" /> New guide
          </Link>
        </Button>
      </div>

      {guides === null ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : guides.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">No guides yet.</p>
            <Button asChild>
              <Link to="/guides/new">Create your first guide</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {guides.map((g) => (
            <Link key={g.id} to="/guides/$id/edit" params={{ id: g.id }}>
              <Card className="hover:border-primary/50 transition-colors h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight">{g.title}</CardTitle>
                    {g.is_public ? (
                      <Badge variant="default" className="shrink-0">
                        <Globe className="h-3 w-3 mr-1" /> Public
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        <Lock className="h-3 w-3 mr-1" /> Draft
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {g.tft_set && <Badge variant="outline">Set {g.tft_set}</Badge>}
                    {g.patch && <Badge variant="outline">Patch {g.patch}</Badge>}
                    <Badge variant="outline">{g.difficulty}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {g.description || "No description yet."}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}