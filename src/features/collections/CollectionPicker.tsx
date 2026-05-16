import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Reserved sentinel value used in the Radix Select for "no collection".
// Radix doesn't allow empty-string values, so we route around it by
// translating this sentinel to `null` at the form boundary.
const NONE = "__none__";
const CREATE = "__create__";

type CollectionOption = { id: string; title: string };

type Props = {
  ownerId: string;
  // Current selection as a collection id or null. The picker translates
  // null ↔ NONE sentinel internally so callers don't have to think about it.
  value: string | null;
  onChange: (value: string | null) => void;
  // Optional label rendered above the trigger. Skipped when used inside a
  // FormField that already supplies its own label.
  label?: string;
  // Optional helper hint under the trigger (e.g. "Optional — guides without
  // a collection still show on your profile").
  description?: string;
};

/**
 * Lightweight folder-picker.
 *
 * Loads the current user's collections, lets them pick one (or "No collection"),
 * and exposes "+ Create collection" as the last option in the dropdown. Picking
 * Create opens an inline modal that asks for one field (title) and, on save,
 * inserts the new row, auto-selects it, and refreshes the local option list —
 * all without unmounting the surrounding form, so a half-filled guide draft
 * never loses state when the creator decides to make a new collection.
 */
export function CollectionPicker({ ownerId, value, onChange, label, description }: Props) {
  const [options, setOptions] = useState<CollectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("collections")
      .select("id, title")
      .eq("owner_id", ownerId)
      .order("title", { ascending: true });
    if (error) {
      toast.error(error.message);
      setOptions([]);
    } else {
      setOptions((data as CollectionOption[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!ownerId) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const handleSelect = (next: string) => {
    if (next === CREATE) {
      setNewTitle("");
      setModalOpen(true);
      return;
    }
    onChange(next === NONE ? null : next);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      toast.error("Give your collection a name");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("collections")
      .insert({ owner_id: ownerId, title })
      .select("id, title")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create collection");
      return;
    }
    setOptions((prev) =>
      [...prev, { id: data.id, title: data.title }].sort((a, b) =>
        a.title.localeCompare(b.title)
      )
    );
    onChange(data.id);
    setModalOpen(false);
    toast.success(`Created "${data.title}"`);
  };

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <Select value={value ?? NONE} onValueChange={handleSelect} disabled={loading}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Loading…" : "No collection"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">No collection</span>
          </SelectItem>
          {options.length > 0 && <SelectSeparator />}
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CREATE}>
            <span className="flex items-center gap-2 text-primary">
              <Plus className="h-3.5 w-3.5" />
              Create collection
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              Group related guides into a shareable folder. You can rename or publish it later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-collection-title">Collection name</Label>
              <Input
                id="new-collection-title"
                autoFocus
                placeholder="e.g. Patch 14.3 Meta"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={80}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create & select"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
