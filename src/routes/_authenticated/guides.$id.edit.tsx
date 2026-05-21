import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Globe, Lock, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { guideFormSchema, type GuideFormValues } from "@/features/guides/types";
import { CollectionPicker } from "@/features/collections/CollectionPicker";
import { CopyLinkButton } from "@/components/copy-link-button";
import { boardStepSchema } from "@/features/board-builder/types";
import { useBoardSteps } from "@/features/board-builder/use-board-steps";
import { BoardStepList } from "@/features/board-builder/BoardStepList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/features/board-builder/RichTextEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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

export const Route = createFileRoute("/_authenticated/guides/$id/edit")({
  component: EditGuide,
});

const boardStepsSchema = z.array(boardStepSchema);

function EditGuide() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Collection memberships are tracked outside the zod form so changes can
  // round-trip to the junction live (toggle → INSERT/DELETE) without
  // waiting for the main "Save guide" button. Membership is intrinsically
  // many-to-many: a guide can sit in any number of the owner's collections.
  const [collectionIds, setCollectionIds] = useState<string[]>([]);

  const form = useForm<GuideFormValues>({
    resolver: zodResolver(guideFormSchema),
    defaultValues: {
      title: "",
      description: "",
      tft_set: "",
      patch: "",
      playstyle: "",
      difficulty: "medium",
      final_comp_notes: "",
      is_public: false,
    },
  });
  const { reset } = form;

  const { steps, setSteps, addStep, updateStep, removeStep, duplicateStep } = useBoardSteps();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // Load the guide row and its current collection memberships in parallel.
      // The junction query returns only the collection ids; the picker is
      // responsible for hydrating titles separately so it can show "Folder X"
      // even when this page hasn't fetched the collection list itself.
      const [guideRes, memberRes] = await Promise.all([
        supabase
          .from("guides")
          .select(
            "author_id, slug, title, description, tft_set, patch, playstyle, difficulty, final_comp_notes, is_public, board_steps",
          )
          .eq("id", id)
          .single(),
        supabase.from("collection_guides").select("collection_id").eq("guide_id", id),
      ]);
      if (cancelled) return;
      const { data, error } = guideRes;
      if (error || !data) {
        toast.error("Guide not found");
        navigate({ to: "/dashboard" });
        return;
      }
      if (data.author_id !== user.id) {
        toast.error("You don't have permission to edit this guide");
        navigate({ to: "/dashboard" });
        return;
      }
      setSlug(data.slug);
      setCollectionIds(
        ((memberRes.data ?? []) as { collection_id: string }[]).map((r) => r.collection_id),
      );
      reset({
        title: data.title,
        description: data.description ?? "",
        tft_set: data.tft_set ?? "",
        patch: data.patch ?? "",
        playstyle: data.playstyle ?? "",
        difficulty: data.difficulty,
        final_comp_notes: data.final_comp_notes ?? "",
        is_public: data.is_public,
      });
      const parsed = boardStepsSchema.safeParse(data.board_steps);
      setSteps(parsed.success ? parsed.data : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user, navigate, reset, setSteps]);

  // ----- Live membership sync -----
  //
  // The picker is fully controlled (parent owns the array). When the user
  // toggles a row OR creates a new collection, the new id list arrives via
  // onChange. We diff it against the previously-known list, then run the
  // minimum set of INSERT/DELETE statements to bring the junction in sync.
  // RLS rejects writes against collections the user doesn't own, so we
  // don't have to defend against that here.
  const handleCollectionsChange = async (next: string[]) => {
    const prev = collectionIds;
    setCollectionIds(next); // optimistic
    const added = next.filter((cid) => !prev.includes(cid));
    const removed = prev.filter((cid) => !next.includes(cid));

    const writes: Promise<unknown>[] = [];
    if (added.length > 0) {
      writes.push(
        supabase
          .from("collection_guides")
          .insert(added.map((cid) => ({ collection_id: cid, guide_id: id }))),
      );
    }
    if (removed.length > 0) {
      for (const cid of removed) {
        writes.push(
          supabase.from("collection_guides").delete().eq("collection_id", cid).eq("guide_id", id),
        );
      }
    }
    const results = (await Promise.all(writes)) as { error?: { message: string } }[];
    const firstError = results.find((r) => r?.error)?.error;
    if (firstError) {
      // Revert the optimistic update on the first failure and surface why.
      toast.error(`Couldn't update collections: ${firstError.message}`);
      setCollectionIds(prev);
    }
  };

  const onSubmit = async (values: GuideFormValues) => {
    // Collection memberships are persisted live via handleCollectionsChange
    // (toggles in the picker write to the junction immediately), so the
    // main "Save guide" submit only writes the guide row itself.
    const { error } = await supabase
      .from("guides")
      .update({
        title: values.title,
        description: values.description,
        tft_set: values.tft_set,
        patch: values.patch,
        playstyle: values.playstyle,
        difficulty: values.difficulty,
        final_comp_notes: values.final_comp_notes,
        is_public: values.is_public,
        board_steps: steps,
      })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("guides").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Guide deleted");
    navigate({ to: "/dashboard" });
  };

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Loading...</div>;
  }

  const isPublic = form.watch("is_public");

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-10 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit guide</h1>
          {slug && (
            <p className="text-sm text-muted-foreground mt-1">
              Public URL: <code className="text-xs">/g/{slug}</code>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isPublic && slug && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/g/$slug" params={{ slug }}>
                  <ExternalLink className="h-4 w-4 mr-1" /> View public
                </Link>
              </Button>
              <CopyLinkButton href={`/g/${slug}`} variant="outline" stopPropagation={false} />
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this guide?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Set 17 Reroll Jinx" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="playstyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Playstyle</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Reroll, Fast 8, Standard" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <RichTextEditor
                      value={field.value || ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder="Short summary of the comp..."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {user && (
                <CollectionPicker
                  ownerId={user.id}
                  value={collectionIds}
                  onChange={handleCollectionsChange}
                  label="Collections"
                  description="Optional — pick one or more folders this guide should live in. Changes save immediately."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Final comp notes</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="final_comp_notes"
                render={({ field }) => (
                  <FormItem>
                    <RichTextEditor
                      value={field.value || ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder="How the comp wins, item priority, positioning notes…"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Board Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Board steps</CardTitle>
            </CardHeader>
            <CardContent>
              <BoardStepList
                steps={steps}
                onAdd={addStep}
                onUpdate={updateStep}
                onRemove={removeStep}
                onDuplicate={duplicateStep}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="is_public"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {field.value ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      <div>
                        <p className="text-sm font-medium">{field.value ? "Published" : "Draft"}</p>
                        <p className="text-xs text-muted-foreground">
                          {field.value
                            ? "Anyone with the link can view this guide."
                            : "Only you can see this guide."}
                        </p>
                      </div>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link to="/dashboard">Cancel</Link>
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
