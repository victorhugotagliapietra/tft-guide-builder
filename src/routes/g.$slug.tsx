import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Swords } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/g/$slug")({
  component: PublicGuide,
});

type Guide = {
  id: string;
  title: string;
  description: string;
  tft_set: string;
  patch: string;
  playstyle: string;
  difficulty: "easy" | "medium" | "hard";
  final_comp_notes: string;
};

function PublicGuide() {
  const { slug } = Route.useParams();
  const [guide, setGuide] = useState<Guide | null | "missing">(null);

  useEffect(() => {
    supabase
      .from("guides")
      .select("id, title, description, tft_set, patch, playstyle, difficulty, final_comp_notes")
      .eq("slug", slug)
      .eq("is_public", true)
      .maybeSingle()
      .then(({ data }) => setGuide(data ? (data as Guide) : "missing"));
  }, [slug]);

  if (guide === null) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading...
        </main>
      </div>
    );
  }

  if (guide === "missing") {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center px-4 text-center">
          <div>
            <h1 className="text-2xl font-semibold">Guide not found</h1>
            <p className="text-muted-foreground mt-2">
              It may be private or no longer exist.
            </p>
            <Link to="/" className="text-primary hover:underline mt-4 inline-block">
              Back to home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-10 space-y-6">
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {guide.tft_set && <Badge variant="secondary">Set {guide.tft_set}</Badge>}
            {guide.patch && <Badge variant="outline">Patch {guide.patch}</Badge>}
            <Badge>{guide.difficulty}</Badge>
            {guide.playstyle && <Badge variant="outline">{guide.playstyle}</Badge>}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">{guide.title}</h1>
          {guide.description && (
            <p className="text-lg text-muted-foreground mt-3">{guide.description}</p>
          )}
        </div>

        {guide.final_comp_notes && (
          <Card>
            <CardHeader>
              <CardTitle>Final comp notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {guide.final_comp_notes}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-4 w-4 text-primary" /> Boards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The visual board builder is coming soon. Board steps will appear here.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}