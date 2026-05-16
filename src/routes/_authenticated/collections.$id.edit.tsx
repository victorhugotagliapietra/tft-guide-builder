import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Globe,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  collectionFormSchema,
  type CollectionFormValues,
} from "@/features/collections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { GuideSummary } from "@/features/guides/types";

export const Route = createFileRoute("/_authenticated/collections/$id/edit")({
  component: EditCollection,
});

type GuidePick = GuideSummary;
type Member = GuidePick & { position: number };

/**
 * Collection editor. Loads the collection metadata + ordered membership in
 * parallel, lets the owner:
 *
 *   - Rename, edit description, toggle published
 *   - Add/remove guides from a "library" picker (sourced from the owner's
 *     own guides — you can only put your guides into your collections)
 *   - Reorder guides up/down
 *   - Delete the collection entirely
 *
 * Ordering is stored as integer `position`; we re-assign sequential
 * positions on save so gaps from deletes don't accumulate.
 */
function EditCollection() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [allGuides, setAllGuides] = useState<GuidePick[]>([]);

  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: { title: "", description: "", is_public: false },
  });
  const { reset } = form;

  // Initial load: collection row + junction rows + owner's full guide
  // library (so the picker can show what's available to add).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [collectionRes, junctionRes, libraryRes] = await Promise.all([
        supabase
          .from("collections")
          .select("owner_id, title, description, is_public")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("collection_guides")
          .select("guide_id, position")
          .eq("collection_id", id)
          .order("position", { ascending: true }),
        supabase
          .from("guides")
          .select("id, slug, title, description, tft_set, patch, difficulty, is_public, updated_at")
          .eq("author_id", user.id)
          .order("updated_at", { ascending: false }),
      ]);
      if (cancelled) return;

      if (collectionRes.error || !collectionRes.data) {
        toast.error("Collection not found");
        navigate({ to: "/collections" });
        return;
      }
      if (collectionRes.data.owner_id !== user.id) {
        toast.error("You don't have permission to edit this collection");
        navigate({ to: "/collections" });
        return;
      }

      reset({
        title: collectionRes.data.title,
        description: collectionRes.data.description ?? "",
        is_public: collectionRes.data.is_public,
      });

      // Hydrate the ordered membership by looking up the actual guide rows.
      // RLS allows the owner to read their own drafts, so this returns
      // everything regardless of publication state.
      const positions = new Map(
        (junctionRes.data ?? []).map((r) => [r.guide_id, r.position])
      );
      const library = (libraryRes.data as GuidePick[]) ?? [];
      const memberRows: Member[] = library
        .filter((g) => positions.has(g.id))
        .map((g) => ({ ...g, position: positions.get(g.id) ?? 0 }))
        .sort((a, b) => a.position - b.position);

      setMembers(memberRows);
      setAllGuides(library);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user, navigate, reset]);

  const onSubmit = useCallback(
    async (values: CollectionFormValues) => {
      // Three coordinated writes:
      //   1. UPDATE the collection row metadata.
      //   2. DELETE all junction rows, then INSERT the current order.
      //      (Simpler than diffing — collections are small, < a few dozen
      //      guides in practice, so the wire cost is negligible.)
      const { error: metaErr } = await supabase
        .from("collections")
        .update({
          title: values.title,
          description: values.description,
          is_public: values.is_public,
        })
        .eq("id", id);
      if (metaErr) {
        toast.error(metaErr.message);
        return;
      }

      const { error: delErr } = await supabase
        .from("collection_guides")
        .delete()
        .eq("collection_id", id);
      if (delErr) {
        toast.error(delErr.message);
        return;
      }

      if (members.length > 0) {
        const { error: insErr } = await supabase.from("collection_guides").insert(
          members.map((m, i) => ({
            collection_id: id,
            guide_id: m.id,
            position: i,
          }))
        );
        if (insErr) {
          toast.error(insErr.message);
          return;
        }
      }

      toast.success("Saved");
    },
    [id, members]
  );

  const handleDelete = async () => {
    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Collection deleted");
    navigate({ to: "/collections" });
  };

  const move = (index: number, dir: -1 | 1) => {
    setMembers((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const remove = (guideId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== guideId));
  };

  const add = (guide: GuidePick) => {
    setMembers((prev) =>
      prev.some((m) => m.id === guide.id)
        ? prev
        : [...prev, { ...guide, position: prev.length }]
    );
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-muted-foreground">Loading…</div>
    );
  }

  const isPublic = form.watch("is_public");
  const memberIds = new Set(members.map((m) => m.id));
  const available = allGuides.filter((g) => !memberIds.has(g.id));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Edit collection</h1>
        <div className="flex items-center gap-2">
          {isPublic && (
            <Button asChild variant="outline" size="sm">
              <Link to="/collection/$id" params={{ id }}>
                <ExternalLink className="h-4 w-4 mr-1" /> View public page
              </Link>
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this collection?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the collection and its share link. The guides inside it are not
                  deleted — they stay on your profile and remain editable.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder="What's this collection about?"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_public"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-2">
                        {field.value ? (
                          <>
                            <Globe className="h-4 w-4" /> Public
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4" /> Draft
                          </>
                        )}
                      </FormLabel>
                      <FormDescription className="text-xs">
                        {field.value
                          ? "Anyone with the link can view this collection. It also appears on your profile."
                          : "Only you can see this collection. Toggle on to share it."}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="w-full"
              >
                {form.formState.isSubmitting ? "Saving…" : "Save collection"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Guides ({members.length})</CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={available.length === 0}>
                <Plus className="h-4 w-4 mr-1" />
                Add guides
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add guides to this collection</DialogTitle>
              </DialogHeader>
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  All your guides are already in this collection. Create another guide to add it
                  here.
                </p>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                  {available.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => add(g)}
                      className="w-full flex items-center justify-between text-left gap-3 rounded-md border border-border px-3 py-2 hover:border-primary/50 hover:bg-accent transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{g.title}</div>
                        <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                          {!g.is_public && <span className="text-amber-500">Draft</span>}
                          {g.tft_set && <span>Set {g.tft_set}</span>}
                          {g.patch && <span>Patch {g.patch}</span>}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No guides yet. Click <span className="font-medium">Add guides</span> to pick from
              your library.
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((m, i) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <span className="text-xs font-mono text-muted-foreground w-6 text-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{m.title}</div>
                    <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                      {!m.is_public && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Draft — hidden on public page
                        </Badge>
                      )}
                      {m.tft_set && <span>Set {m.tft_set}</span>}
                      {m.patch && <span>Patch {m.patch}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => move(i, 1)}
                      disabled={i === members.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(m.id)}
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Order and membership are saved when you click <span className="font-medium">Save
            collection</span> above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
