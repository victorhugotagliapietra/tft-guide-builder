import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ClipboardCopy,
  LayoutDashboard,
  Layers,
  Share2,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useGoogleSignIn } from "@/hooks/use-google-signin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { htmlExcerpt } from "@/lib/html-text";

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

/**
 * Hexcraft landing.
 *
 * Three sections, each with its own visual rhythm so the page doesn't read
 * as one long card grid:
 *   1. Hero — oversized display headline, single primary CTA, subtle hex
 *      grid backdrop bleeding into the ink plate.
 *   2. "What it does" — three editorial-style feature blocks, no card
 *      chrome, accent rule above each title.
 *   3. Recent public guides — only renders if guides exist; styled as a
 *      compact gallery so it looks like fresh inventory, not stock cards.
 *
 * Footer is intentionally short and unattributed — no "Built with X"
 * stamps. The platform's identity is its own.
 */
function Index() {
  const [guides, setGuides] = useState<PublicGuide[]>([]);
  const { user } = useAuth();
  const { signInWithGoogle, signingIn } = useGoogleSignIn();

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
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden">
          {/* Hex-grid wash sits behind everything in the hero, masked to a
              soft ellipse so it fades into the body's vignette. */}
          <div className="absolute inset-0 bg-hex-grid pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl px-4 pt-24 pb-20 text-center">
            <Badge
              variant="outline"
              className="mb-7 gap-1.5 border-primary/30 bg-primary/5 text-primary/90"
            >
              <Sparkles className="h-3 w-3" /> A workshop for TFT creators
            </Badge>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
              Comps,{" "}
              <span className="text-primary">level by level.</span>
            </h1>
            <p className="mt-7 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Hexcraft turns your knowledge into shareable, step-by-step TFT guides. Sketch the
              level-4 econ board, plan the level-7 roll, lock in the capped roster — all at one
              link your viewers can paste into the client.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
              {user ? (
                <Button asChild size="lg" className="text-base h-12 px-7">
                  <Link to="/dashboard">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Open the workshop
                  </Link>
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="text-base h-12 px-7"
                  onClick={() => signInWithGoogle("/guides/new")}
                  disabled={signingIn}
                >
                  Start a guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {guides.length > 0 && (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="text-base h-12 px-7"
                >
                  <a href="#recent">Browse fresh comps</a>
                </Button>
              )}
            </div>
            {/* Micro-credibility row — sits under the CTA so first-time
                visitors see "this is for serious creators" without us
                needing testimonials yet. */}
            <p className="mt-12 text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
              No downloads · No watermark · Free for creators
            </p>
          </div>
        </section>

        {/* ---------- What it does ---------- */}
        <section className="mx-auto max-w-5xl px-4 py-20 border-t border-border/60">
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-2">
            Built around how players actually climb.
          </h2>
          <p className="text-muted-foreground max-w-2xl">
            Most guides show you a finished comp. Hexcraft shows the full path — every transition,
            every reroll, every "if you hit by 3-2 do this instead".
          </p>

          <div className="grid md:grid-cols-3 gap-10 mt-14">
            <FeatureBlock
              eyebrow="Boards"
              icon={<Layers className="h-5 w-5" />}
              title="Tempo as content"
              text="Stack board steps from early game to capped. Each step gets its own positioning, items, and notes — the comp tells its own story."
            />
            <FeatureBlock
              eyebrow="Sharing"
              icon={<Share2 className="h-5 w-5" />}
              title="One link, no signup"
              text="Publish a guide and anyone can read it. No app, no account, no Riot-side import friction — viewers paste a planner code and the in-game team-planner does the rest."
            />
            <FeatureBlock
              eyebrow="Workflow"
              icon={<ClipboardCopy className="h-5 w-5" />}
              title="Made for creators"
              text="Sign in with Google, group your guides into collections, share a profile link in your bio. The platform stays out of your way."
            />
          </div>
        </section>

        {/* ---------- Recent public guides ---------- */}
        {guides.length > 0 && (
          <section
            id="recent"
            className="mx-auto max-w-5xl px-4 pb-24 pt-4 border-t border-border/60"
          >
            <div className="flex items-end justify-between gap-4 mb-8 flex-wrap pt-16">
              <div>
                <h2 className="font-display text-3xl font-semibold tracking-tight">
                  Fresh from the workshop
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  The latest published guides from creators on Hexcraft.
                </p>
              </div>
              {!user && (
                <Button
                  variant="outline"
                  onClick={() => signInWithGoogle("/guides/new")}
                  disabled={signingIn}
                >
                  Publish your own
                </Button>
              )}
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {guides.map((g) => (
                <Link
                  key={g.id}
                  to="/g/$slug"
                  params={{ slug: g.slug }}
                  className="block h-full"
                >
                  <Card className="h-full transition-all hover:border-primary/40 hover:-translate-y-0.5">
                    <CardContent className="p-5">
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {g.tft_set && (
                          <Badge variant="secondary" className="text-[10px]">
                            Set {g.tft_set}
                          </Badge>
                        )}
                        {g.patch && (
                          <Badge variant="outline" className="text-[10px]">
                            Patch {g.patch}
                          </Badge>
                        )}
                        <Badge className="text-[10px] capitalize bg-accent/15 text-accent border-accent/30 border">
                          {g.difficulty}
                        </Badge>
                      </div>
                      <h3 className="font-display text-lg font-semibold tracking-tight mb-2 leading-snug line-clamp-2">
                        {g.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {htmlExcerpt(g.description, 160) || "No description yet."}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-5xl px-4 flex items-center justify-center text-xs text-muted-foreground">
          <span className="font-display tracking-tight">Hexcraft</span>
        </div>
      </footer>
    </div>
  );
}

/**
 * Editorial-style feature block. No card chrome — just an accent rule, a
 * small eyebrow line, the icon inline with a strong title, and body copy.
 * Reads more like a magazine column than a marketing card row.
 */
function FeatureBlock({
  eyebrow,
  icon,
  title,
  text,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="space-y-3">
      <div className="h-px w-10 bg-primary" />
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <div className="flex items-center gap-2 text-foreground">
        <span className="text-primary">{icon}</span>
        <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}
