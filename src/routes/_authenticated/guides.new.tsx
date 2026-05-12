import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { newGuideSchema } from "@/features/guides/types";
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

function NewGuide() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
