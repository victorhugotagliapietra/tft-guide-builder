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
 * Lightweight guide creation form. Two fields:
 *   - Title (required, schema-validated).
 *   - Collection (optional folder assignment; defaults to none).
 *
 * The collection picker is kept outside the zod form because it manages its
 * own modal lifecycle and can mutate the local options list after a "Create
 * collection" inline submit — wiring it through react-hook-form would force
 * us to round-trip dropdown state into form state unnecessarily.
 */
function NewGuide() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const form = useForm<NewGuideValues>({
    resolver: zodResolver(newGuideSchema),
    defaultValues: { title: "" },
  });

  const onSubmit = async ({ title }: NewGuideValues) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("guides")
      .insert({
        author_id: user.id,
        title: title.trim(),
        slug: makeGuideSlug(title),
        // collection_id is nullable; sending null is identical to omitting
        // and matches the "no collection" picker option.
        collection_id: collectionId,
      })
      .select("id")
      .single();

    if (error || !data) {
      toast.error(error?.message ?? "Failed to create guide");
      return;
    }
    navigate({ to: "/guides/$id/edit", params: { id: data.id } });
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
                  value={collectionId}
                  onChange={setCollectionId}
                  label="Collection (optional)"
                  description="Add this guide to a folder. You can change it later."
                />
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Creating..." : "Create guide"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
