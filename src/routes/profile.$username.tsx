import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Folders, ListMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { GuideCard } from "@/features/guides/GuideCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GuideSummary } from "@/features/guides/types";

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type CollectionPreview = {
  id: string;
  title: string;
  description: string;
  guide_count: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ok";
      profile: ProfileRow;
      guides: GuideSummary[];
      collections: CollectionPreview[];
    };

export const Route = createFileRoute("/profile/$username")({
  component: ProfilePage,
});

/**
 * Public creator profile. Lists ONLY published guides and ONLY published
 * collections (RLS enforces this on the server, but the client query mirrors
 * the filter so anonymous viewers don't even see draft IDs in the network
 * tab). Anonymous browsing is the expected default — this page never gates
 * on auth.
 */
function ProfilePage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Profile lookup. Usernames are unique + lowercase via the CHECK
      //    constraint, but we still lowercase the param defensively for
      //    case-insensitive sharing (e.g. someone shares Profile/ALICE).
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      if (cancelled) return;
      if (pErr || !profile || !profile.username) {
        setState({ status: "missing" });
        return;
      }

      // 2. Public guides + public collections, in parallel.
      const [guidesRes, collectionsRes] = await Promise.all([
        supabase
          .from("guides")
          .select("id, slug, title, description, tft_set, patch, difficulty, is_public, updated_at")
          .eq("author_id", profile.id)
          .eq("is_public", true)
          .order("updated_at", { ascending: false }),
        supabase
          .from("collections")
          .select("id, title, description, collection_guides(count)")
          .eq("owner_id", profile.id)
          .eq("is_public", true)
          .order("updated_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const guides = (guidesRes.data as GuideSummary[]) ?? [];
      // Supabase's relational count comes back as `{ count: N }[]` on the
      // foreign-table key. Normalize into a flat number so the card render
      // doesn't have to know about the Supabase wire shape.
      const collections: CollectionPreview[] = (collectionsRes.data ?? []).map(
        (c: { id: string; title: string; description: string; collection_guides?: { count: number }[] }) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          guide_count: c.collection_guides?.[0]?.count ?? 0,
        })
      );

      setState({
        status: "ok",
        profile: profile as ProfileRow,
        guides,
        collections,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  // 404-style state: show a soft message + link home rather than throwing.
  useEffect(() => {
    if (state.status === "missing") {
      // Don't auto-redirect; users following a typo'd link benefit from
      // seeing what went wrong before being whisked away.
    }
  }, [state, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {state.status === "loading" && (
          <div className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">Loading…</div>
        )}

        {state.status === "missing" && (
          <div className="mx-auto max-w-5xl px-4 py-16 text-center">
            <h1 className="text-2xl font-semibold">Creator not found</h1>
            <p className="text-muted-foreground mt-2">
              Nobody owns the username <span className="font-mono">{username}</span> yet.
            </p>
            <Link to="/" className="text-primary hover:underline inline-block mt-4">
              ← Browse guides
            </Link>
          </div>
        )}

        {state.status === "ok" && (
          <>
            <ProfileHeader profile={state.profile} guideCount={state.guides.length} />
            <Section
              title="Collections"
              empty="No public collections yet."
              icon={<Folders className="h-5 w-5" />}
              isEmpty={state.collections.length === 0}
            >
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.collections.map((c) => (
                  <Link key={c.id} to="/collection/$id" params={{ id: c.id }}>
                    <Card className="hover:border-primary/50 transition-colors h-full">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg leading-tight">{c.title}</CardTitle>
                          <Badge variant="outline" className="shrink-0">
                            {c.guide_count} {c.guide_count === 1 ? "guide" : "guides"}
                          </Badge>
                        </div>
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
            </Section>
            <Section
              title="Guides"
              empty="No public guides yet."
              icon={<ListMinus className="h-5 w-5" />}
              isEmpty={state.guides.length === 0}
            >
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.guides.map((g) => (
                  <GuideCard key={g.id} guide={g} variant="public" />
                ))}
              </div>
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function ProfileHeader({ profile, guideCount }: { profile: ProfileRow; guideCount: number }) {
  const display = profile.display_name ?? profile.username;
  const initial = (display[0] ?? "?").toUpperCase();
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-5xl px-4 py-10 flex items-center gap-5">
        <Avatar className="h-20 w-20">
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={display} />}
          <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold leading-tight">{display}</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">@{profile.username}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {guideCount} public {guideCount === 1 ? "guide" : "guides"}
          </p>
        </div>
      </div>
    </section>
  );
}

function Section({
  title,
  icon,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center gap-2 mb-5 text-muted-foreground">
        {icon}
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      </div>
      {isEmpty ? <p className="text-sm text-muted-foreground">{empty}</p> : children}
    </section>
  );
}
