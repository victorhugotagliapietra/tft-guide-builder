import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { newGuideSchema } from "@/features/guides/types";
import { CollectionPicker } from "@/features/collections/CollectionPicker";
import { makeGuideSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export const Route = createFileRoute("/_authenticated/guides/new")({
  component: NewGuide,
});

type NewGuideValues = z.infer<typeof newGuideSchema>;

/**
 * Two-field guide creation form: title + collection memberships.
 *
 * Collections are tracked in local state (deferred mode) rather than written
 * through immediately, because the junction rows reference guides.id and
 * that id doesn't exist until the INSERT below completes. On submit we
 * create the guide first, then bulk-insert the (collection_id, guide_id)
 * pairs into collection_guides in a single round-trip.
 */
function NewGuide() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collectionIds, setCollectionIds] = useState<string[]>([]);

  const form = useForm<NewGuideValues>({
    resolver: zodResolver(newGuideSchema),
    defaultValues: { title: "" },
  });

  const onSubmit = async ({ title }: NewGuideValues) => {
    if (!user) return;
    const { data: created, error } = await supabase
      .from("guides")
      .insert({
        author_id: user.id,
        title: title.trim(),
        slug: makeGuideSlug(title),
      })
      .select("id")
      .single();

    if (error || !created) {
      toast.error(error?.message ?? "Failed to create guide");
      return;
    }

    // Bulk-insert any selected collection memberships in one round-trip.
    // Failure here is non-fatal — the guide already exists, so we surface
    // a warning and let the user fix it from the editor's picker.
    if (collectionIds.length > 0) {
      const { error: linkErr } = await supabase.from("collection_guides").insert(
        collectionIds.map((cid, position) => ({
          collection_id: cid,
          guide_id: created.id,
          position,
        })),
      );
      if (linkErr) {
        console.warn("[guides.new] failed to attach collections:", linkErr.message);
        toast.warning("Guide created, but couldn't attach to all collections.");
      }
    }

    navigate({ to: "/guides/$id/edit", params: { id: created.id } });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>New guide</CardTitle>
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
                      <Input placeholder="e.g. Set 14 Reroll Jinx" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {user && (
                <CollectionPicker
                  ownerId={user.id}
                  value={collectionIds}
                  onChange={setCollectionIds}
                  label="Collections (optional)"
                  description="Pick one or more folders this guide should appear in. You can change it later."
                />
              )}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating..." : "Create guide"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
