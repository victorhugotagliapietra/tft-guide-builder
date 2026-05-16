import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { newCollectionSchema } from "@/features/collections/types";
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

export const Route = createFileRoute("/_authenticated/collections/new")({
  component: NewCollection,
});

type Values = z.infer<typeof newCollectionSchema>;

/**
 * Single-field "what should we call this?" form. Once submitted we drop the
 * user straight into the editor where they can flesh out the description,
 * add guides, and publish. Keeping creation lightweight matches how the
 * guide creation flow works.
 */
function NewCollection() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const form = useForm<Values>({
    resolver: zodResolver(newCollectionSchema),
    defaultValues: { title: "" },
  });

  const onSubmit = async ({ title }: Values) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("collections")
      .insert({ owner_id: user.id, title: title.trim() })
      .select("id")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create collection");
      return;
    }
    navigate({ to: "/collections/$id/edit", params: { id: data.id } });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>New collection</CardTitle>
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
                      <Input placeholder="e.g. Patch 14.3 Meta" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Creating…" : "Create collection"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
