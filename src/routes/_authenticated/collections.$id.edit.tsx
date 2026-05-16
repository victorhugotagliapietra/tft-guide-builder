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
import type { GuideSummary } from "@/features/guides/types";

export const Route = createFileRoute("/_authenticated/collections/$id/edit")({
  component: EditCollection,
});

/**
 * Collection editor — metadata form + drag-and-drop list of the guides
 * assigned to this folder (i.e. `guides.collection_id = this.id`).
 *
 * Guides land in a collection via the picker on the guide form, not here.
 * This page exists to:
 *   - Rename / re-describe / publish / delete the collection.
 *   - Reorder the guides inside it via drag-and-drop.
 *   - Eject a guide (just nulls its `collection_id`).
 *
 * Saving order is debounced auto-save: each drop schedules a single batch
 * UPDATE 600ms later, so a creator rearranging three guides in quick
 * succession produces one write instead of three. Manual "Save" still
 * exists for the metadata fields.
 */
function EditCollection() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<GuideSummary[]>([]);

  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: { title: "", description: "", is_public: false },
  });
  const { reset } = form;

  // Initial load: the collection row + the guides assigned to it.
  // The owner can see all of their own guides regardless of is_public, so
  // a draft assigned to a public collection is still listed here (and the
  // editor surfaces a "won't show publicly" badge so the creator knows).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [collectionRes, guidesRes] = await Promise.all([
        supabase
          .from("collections")
          .select("owner_id, title, description, is_public")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("guides")
          .select("id, slug, title, description, tft_set, patch, difficulty, is_public, updated_at, collection_position")
          .eq("collection_id", id)
          .order("collection_position", { ascending: true }),
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
      setMembers((guidesRes.data as GuideSummary[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user, navigate, reset]);

  // ----- Metadata save (manual button) -----
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
      toast.success("Saved");
    },
    [id]
  );

  // ----- Debounced auto-save of order -----
  //
  // Every drag-end schedules a single trailing-edge save. We persist the
  // entire order by updating each guide's `collection_position`. This is N
  // round-trips (one per row), which is fine at folder-scale (< a few dozen
  // guides); switching to a single bulk RPC would only matter at scale.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleOrderSave = useCallback((next: GuideSummary[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // Re-snapshot at fire time so a rapid sequence of drags collapses
      // into the latest order rather than racing each other.
      const updates = next.map((g, position) =>
        supabase.from("guides").update({ collection_position: position }).eq("id", g.id)
      );
      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        toast.error(`Couldn't save order: ${firstError.message}`);
      }
    }, 600);
  }, []);

  // ----- Drag-and-drop handler -----
  const sensors = useSensors(
    // 6-pixel activation threshold so accidental clicks on the row body
    // (e.g. the "View" button) don't start a drag.
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

  // ----- Eject a guide from the collection (sets its collection_id to null) -----
  const ejectGuide = async (guideId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== guideId));
    const { error } = await supabase
      .from("guides")
      .update({ collection_id: null, collection_position: 0 })
      .eq("id", guideId);
    if (error) {
      toast.error(error.message);
      // Best-effort UI revert: re-fetch on error.
      const { data } = await supabase
        .from("guides")
        .select("id, slug, title, description, tft_set, patch, difficulty, is_public, updated_at, collection_position")
        .eq("collection_id", id)
        .order("collection_position", { ascending: true });
      setMembers((data as GuideSummary[]) ?? []);
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Edit collection</h1>
        <div className="flex items-center gap-2">
          {isPublic && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/collection/$id" params={{ id }}>
                  <ExternalLink className="h-4 w-4 mr-1" /> View public page
                </Link>
              </Button>
              <CopyLinkButton
                href={`/collection/${id}`}
                variant="outline"
                stopPropagation={false}
              />
            </>
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
                  deleted — they stay on your profile and remain editable, just unassigned.
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
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="w-full"
              >
                {form.formState.isSubmitting ? "Saving…" : "Save details"}
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
            open the guide and pick this collection from its dropdown.
          </p>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No guides yet. Open any of <Link to="/dashboard" className="underline">your
              guides</Link> and assign it to this collection from the dropdown in the editor.
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
 * Single draggable row. The drag handle is the GripVertical button on the
 * left — the rest of the row keeps normal pointer events so creators can
 * still click the title link or the eject button without triggering a drag.
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
    // While dragging, lift the row visually and dim the rest so the user
    // can't lose track of what they're moving in a long list.
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
        title="Remove from collection (the guide itself isn't deleted)"
      >
        Remove
      </Button>
    </li>
  );
}
