import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Folders, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CopyLinkButton } from "@/components/copy-link-button";
import { htmlExcerpt } from "@/lib/html-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Lives at /_authenticated/collections/index.tsx (directory-based) instead
// of the flat collections.tsx / collections.index.tsx form. The flat form
// shared a path prefix with collections.new.tsx and collections.$id.edit.tsx
// and the TanStack file-based plugin auto-promoted it to a layout — silently
// swallowing nested route children. Directory nesting is unambiguous and
// every file in here is a clean leaf.
export const Route = createFileRoute("/_authenticated/collections/")({
  component: CollectionsList,
});

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

/**
 * Owner-facing list of all collections (drafts AND published).
 *
 * "New collection" is an inline Dialog rather than a separate route — one
 * field, instant create, immediate redirect to the editor. Avoids the
 * round-trip-through-a-form-page UX and avoids the routing edge cases that
 * separate `/collections/new` route triggered.
 */
function CollectionsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // ---- New-collection modal state ----
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const loadCollections = async () => {
    if (!user) return;
    // Counts come from the junction (collection_guides) — one row per
    // (collection, guide) pair. We want the owner-facing count (drafts
    // included), which is just the raw junction count since RLS doesn't
    // filter our own rows.
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
  };

  useEffect(() => {
    void loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const title = newTitle.trim();
    if (!title) {
      toast.error("Give your collection a name");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("collections")
      .insert({ owner_id: user.id, title })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create collection");
      return;
    }
    // Drop the user straight into the new collection's editor — the natural
    // next action is "add guides" / "publish", which both live there.
    setModalOpen(false);
    setNewTitle("");
    toast.success(`Created "${title}"`);
    navigate({ to: "/collections/$id/edit", params: { id: data.id } });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Folders className="h-7 w-7" /> Your collections
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Group guides into shareable folders — "Beginner comps", "Patch 14.3 meta", etc.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New collection
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
            <Button onClick={() => setModalOpen(true)}>Create your first collection</Button>
          </CardContent>
        </Card>
      )}
      {state.status === "ok" && state.items.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.items.map((c) => (
            <Link
              key={c.id}
              to="/collections/$id/edit"
              params={{ id: c.id }}
              className="block h-full"
            >
              <Card className="hover:border-primary/50 transition-colors h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight">{c.title}</CardTitle>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.is_public ? (
                        <Badge variant="default">
                          <Globe className="h-3 w-3 mr-1" /> Public
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Lock className="h-3 w-3 mr-1" /> Draft
                        </Badge>
                      )}
                      {/* Copy link on every card. Draft collections redirect
                          anon viewers to the creator profile, but the owner
                          can still preview through this URL, and they often
                          want it in the clipboard before publishing. */}
                      <CopyLinkButton
                        href={`/collection/${c.id}`}
                        iconOnly
                        variant="ghost"
                        stopPropagation
                      />
                    </div>
                  </div>
                  <Badge variant="outline" className="self-start mt-1">
                    {c.guide_count} {c.guide_count === 1 ? "guide" : "guides"}
                  </Badge>
                </CardHeader>
                {c.description && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {htmlExcerpt(c.description, 140)}
                    </p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* ---- New-collection modal ----
          One field, primary CTA, escape-to-cancel. After create, the
          handler redirects into /collections/$id/edit so the next action
          (adding guides / publishing) is one click away. */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              Group related guides into a shareable folder. You can rename, describe, and
              publish it on the next screen.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-collection-title">Collection name</Label>
              <Input
                id="new-collection-title"
                autoFocus
                placeholder="e.g. Patch 14.3 Meta"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={80}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create collection"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
