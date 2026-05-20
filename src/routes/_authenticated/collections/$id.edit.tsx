import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ExternalLink,
  Globe,
  GripVertical,
  Lock,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  collectionFormSchema,
  type CollectionFormValues,
} from "@/features/collections/types";
import { CopyLinkButton } from "@/components/copy-link-button";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { GuideSummary } from "@/features/guides/types";

// Directory-based route — `_authenticated/collections/$id.edit.tsx`.
// Lives under a directory instead of flat dot-naming so the TanStack router
// treats it as a clean leaf and doesn't auto-promote a sibling to a layout.
export const Route = createFileRoute("/_authenticated/collections/$id/edit")({
  component: EditCollection,
});

type Member = GuideSummary & { position: number };

/**
 * Collection editor.
 *
 * Three concerns live here:
 *   1. Metadata form (title / description / publish) — manual save button.
 *      The button itself switches between "Save details" (primary honey
 *      when the form is dirty) and "Saved" (mint accent + check icon when
 *      pristine) so the creator always knows whether their last edit hit
 *      the database.
 *   2. Guides list — drag-and-drop reorder, debounced auto-save. Pulled
 *      from the collection_guides junction joined to the guides table.
 *   3. Eject — removes the junction row for a single guide without
 *      touching the guide itself.
 */
function EditCollection() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);

  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: { title: "", description: "", is_public: false },
  });
  const { reset } = form;

  // ----- Load collection metadata + ordered membership -----
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [collectionRes, junctionRes] = await Promise.all([
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

      const positions = new Map(
        (junctionRes.data ?? []).map((r) => [r.guide_id, r.position])
      );
      const guideIds = (junctionRes.data ?? []).map((r) => r.guide_id);

      if (guideIds.length === 0) {
        setMembers([]);
        setLoading(false);
        return;
      }

      // Resolve the guide details for each junction row. RLS already
      // restricts what the viewer can read (owner can see drafts, others
      // only public). Re-sort by the junction's `position` because IN()
      // doesn't preserve order.
      const { data: guideRows } = await supabase
        .from("guides")
        .select(
          "id, slug, title, description, tft_set, patch, difficulty, is_public, updated_at"
        )
        .in("id", guideIds);
      if (cancelled) return;
      const sorted = ((guideRows as GuideSummary[]) ?? [])
        .map((g) => ({ ...g, position: positions.get(g.id) ?? 0 }))
        .sort((a, b) => a.position - b.position);
      setMembers(sorted);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user, navigate, reset]);

  // ----- Metadata save (manual button) -----
  //
  // After a successful save we call reset(values) to mark the form as
  // pristine — that's what flips the button label from "Save details"
  // back to "Saved" (see `formState.isDirty` below). Without the reset,
  // the form would still show isDirty=true after persistence and the
  // user would never see the green confirmation state.
  const onSubmit = useCallback(
    async (values: CollectionFormValues) => {
      const { error } = await supabase
        .from("collections")
        .update({
          title: values.title,
          description: values.description,
          is_public: values.is_public,
        })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      reset(values);
      toast.success("Saved");
    },
    [id, reset]
  );

  // ----- Debounced auto-save of guide order -----
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleOrderSave = useCallback(
    (next: Member[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const updates = next.map((m, position) =>
          supabase
            .from("collection_guides")
            .update({ position })
            .eq("collection_id", id)
            .eq("guide_id", m.id)
        );
        const results = await Promise.all(updates);
        const firstError = results.find((r) => r.error)?.error;
        if (firstError) {
          toast.error(`Couldn't save order: ${firstError.message}`);
        }
      }, 600);
    },
    [id]
  );

  // ----- Drag-and-drop -----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setMembers((prev) => {
      const oldIndex = prev.findIndex((g) => g.id === active.id);
      const newIndex = prev.findIndex((g) => g.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      scheduleOrderSave(next);
      return next;
    });
  };

  // ----- Eject a guide (removes the junction row only) -----
  const ejectGuide = async (guideId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== guideId));
    const { error } = await supabase
      .from("collection_guides")
      .delete()
      .eq("collection_id", id)
      .eq("guide_id", guideId);
    if (error) {
      toast.error(error.message);
    }
  };

  const handleDeleteCollection = async () => {
    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Collection deleted");
    navigate({ to: "/collections" });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-muted-foreground">Loading…</div>
    );
  }

  const isPublic = form.watch("is_public");
  // Submit button drives off `isDirty` from react-hook-form. After reset()
  // on success, isDirty flips back to false and the button shows the
  // mint-accent "Saved" pill instead of the primary "Save details" CTA.
  const isDirty = form.formState.isDirty;
  const isSubmitting = form.formState.isSubmitting;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Edit collection</h1>
        <div className="flex items-center gap-2">
          {/* Copy link is always visible — drafts are only viewable by the
              owner via that URL today, but the moment they flip the publish
              switch the same link works for everyone, so it's useful to
              have ready in the clipboard already. */}
          <CopyLinkButton
            href={`/collection/${id}`}
            variant="outline"
            stopPropagation={false}
          />
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
                  deleted — they stay on your profile and remain editable, just unassigned from
                  this folder.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteCollection}>Delete</AlertDialogAction>
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
              {/* Save / Saved button. When the form is dirty we show the
                  primary CTA. When pristine (post-save or untouched) we
                  swap to the mint accent with a check icon — gives the
                  creator immediate confidence the state on screen matches
                  the database. */}
              <Button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className={cn(
                  "w-full transition-colors",
                  !isDirty &&
                    !isSubmitting &&
                    "bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-100"
                )}
              >
                {isSubmitting ? (
                  "Saving…"
                ) : !isDirty ? (
                  <>
                    <Check className="h-4 w-4 mr-2" /> Saved
                  </>
                ) : (
                  "Save details"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guides ({members.length})</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Drag to reorder — changes save automatically. To add a guide to this collection,
            open the guide and tick this collection in its picker.
          </p>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No guides yet. Open any of <Link to="/dashboard" className="underline">your
              guides</Link> and tick this collection in its picker to add it here.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {members.map((m, i) => (
                    <SortableRow
                      key={m.id}
                      guide={m}
                      index={i}
                      onEject={() => ejectGuide(m.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * One draggable guide row. Drag handle is the GripVertical button — the
 * rest of the row keeps normal click behaviour so the title link and the
 * Remove button still work without triggering a drag.
 */
function SortableRow({
  guide,
  index,
  onEject,
}: {
  guide: GuideSummary;
  index: number;
  onEject: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: guide.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="text-xs font-mono text-muted-foreground w-6 text-center">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <Link
          to="/guides/$id/edit"
          params={{ id: guide.id }}
          className="font-medium truncate hover:underline block"
        >
          {guide.title}
        </Link>
        <div className="text-xs text-muted-foreground flex gap-2 mt-0.5 items-center">
          {!guide.is_public && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Draft — hidden on public page
            </Badge>
          )}
          {guide.tft_set && <span>Set {guide.tft_set}</span>}
          {guide.patch && <span>Patch {guide.patch}</span>}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEject}
        title="Remove from this collection (the guide itself isn't deleted)"
      >
        Remove
      </Button>
    </li>
  );
}
