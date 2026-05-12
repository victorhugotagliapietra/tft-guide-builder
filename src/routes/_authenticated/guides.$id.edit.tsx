import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, Lock, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type GuideForm = {
  title: string;
  description: string;
  tft_set: string;
  patch: string;
  playstyle: string;
  difficulty: "easy" | "medium" | "hard";
  final_comp_notes: string;
  is_public: boolean;
  slug: string;
};

function EditGuide() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<GuideForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("guides")
      .select("title, description, tft_set, patch, playstyle, difficulty, final_comp_notes, is_public, slug")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error("Guide not found");
          navigate({ to: "/dashboard" });
          return;
        }
        setForm(data as GuideForm);
      });
  }, [id, navigate]);

  const update = <K extends keyof GuideForm>(key: K, value: GuideForm[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase
      .from("guides")
      .update({
        title: form.title,
        description: form.description,
        tft_set: form.tft_set,
        patch: form.patch,
        playstyle: form.playstyle,
        difficulty: form.difficulty,
        final_comp_notes: form.final_comp_notes,
        is_public: form.is_public,
      })
      .eq("id", id);
    setSaving(false);
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

  if (!form) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit guide</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Slug: <code className="text-xs">{form.slug}</code>
          </p>
        </div>
        <div className="flex gap-2">
          {form.is_public && (
            <Button asChild variant="outline" size="sm">
              <Link to="/g/$slug" params={{ slug: form.slug }}>
                <ExternalLink className="h-4 w-4 mr-1" /> View public
              </Link>
            </Button>
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

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="set">TFT Set</Label>
              <Input id="set" placeholder="e.g. 12" value={form.tft_set} onChange={(e) => update("tft_set", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patch">Patch</Label>
              <Input id="patch" placeholder="e.g. 14.10" value={form.patch} onChange={(e) => update("patch", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select
                value={form.difficulty}
                onValueChange={(v) => update("difficulty", v as GuideForm["difficulty"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="playstyle">Playstyle</Label>
            <Input
              id="playstyle"
              placeholder="e.g. Reroll, Fast 8, Standard"
              value={form.playstyle}
              onChange={(e) => update("playstyle", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Final comp notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={6}
            placeholder="How the comp wins, item priority, positioning notes..."
            value={form.final_comp_notes}
            onChange={(e) => update("final_comp_notes", e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Boards</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The visual board builder is coming next. Each board step (early, mid, capped) will
            live here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sharing</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {form.is_public ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            <div>
              <p className="text-sm font-medium">
                {form.is_public ? "Public" : "Private draft"}
              </p>
              <p className="text-xs text-muted-foreground">
                {form.is_public
                  ? "Anyone with the link can view this guide."
                  : "Only you can see this guide."}
              </p>
            </div>
          </div>
          <Switch
            checked={form.is_public}
            onCheckedChange={(v) => update("is_public", v)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link to="/dashboard">Cancel</Link>
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}