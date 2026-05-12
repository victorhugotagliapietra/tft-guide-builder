import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { makeGuideSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/guides/new")({
  component: NewGuide,
});

function NewGuide() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("guides")
      .insert({
        author_id: user.id,
        title: title.trim(),
        slug: makeGuideSlug(title),
      })
      .select("id")
      .single();
    setLoading(false);
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
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                required
                placeholder="e.g. Set 12 Reroll Lillia"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !title.trim()}>
              {loading ? "Creating..." : "Create guide"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}