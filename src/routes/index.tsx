import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Layers, Share2, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

type PublicGuide = {
  id: string;
  slug: string;
  title: string;
  description: string;
  tft_set: string;
  patch: string;
  difficulty: "easy" | "medium" | "hard";
};

function Index() {
  const [guides, setGuides] = useState<PublicGuide[]>([]);

  useEffect(() => {
    supabase
      .from("guides")
      .select("id, slug, title, description, tft_set, patch, difficulty")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }) => setGuides((data as PublicGuide[]) ?? []));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <Badge variant="outline" className="mb-6">
            <Sparkles className="h-3 w-3 mr-1" /> Build progressive comps
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Teach the whole game,
            <br />
            not just the final board.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Create TFT guides with optional level-by-level boards. Show the early game,
            the transitions, and the capped board — all in one shareable link.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">
                Start a guide <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 grid md:grid-cols-3 gap-4">
          <FeatureCard
            icon={<Layers className="h-5 w-5" />}
            title="Progressive boards"
            text="Add as many board steps as you want — Level 4 early, Level 7 roll, capped. All optional."
          />
          <FeatureCard
            icon={<Share2 className="h-5 w-5" />}
            title="Public share links"
            text="Publish a guide and anyone can read it without an account."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Built for clarity"
            text="A clean reading experience that explains how to actually get to the comp."
          />
        </section>

        {guides.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-20">
            <h2 className="text-2xl font-semibold mb-6">Recent public guides</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {guides.map((g) => (
                <Link key={g.id} to="/g/$slug" params={{ slug: g.slug }}>
                  <Card className="hover:border-primary/50 transition-colors h-full">
                    <CardHeader>
                      <CardTitle className="text-lg">{g.title}</CardTitle>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {g.tft_set && <Badge variant="secondary">Set {g.tft_set}</Badge>}
                        {g.patch && <Badge variant="outline">Patch {g.patch}</Badge>}
                        <Badge>{g.difficulty}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {g.description || "No description yet."}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Built with Lovable. Not affiliated with Riot Games.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
        <CardTitle className="text-base mt-2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
