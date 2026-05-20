import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Folders, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CollectionOption = { id: string; title: string };

type Props = {
  ownerId: string;
  /**
   * Multi-select model: an array of collection ids the guide belongs to.
   * Empty array = guide is in zero collections (the default for a new guide).
   */
  value: string[];
  /**
   * Called whenever the membership set changes — either via a row toggle
   * or after the "+ Create collection" inline modal completes. Parents
   * decide whether to write to the DB immediately (live mode, used by the
   * guide editor) or to hold the set until the form is submitted (deferred
   * mode, used by the new-guide form before the guide row exists).
   */
  onChange: (next: string[]) => void;
  label?: string;
  description?: string;
};

/**
 * Multi-select collection picker.
 *
 * The trigger looks like a dropdown — clicking it opens a Popover with a
 * scrollable list of the user's collections, each row being a checkable
 * item. The check sits on the left so the eye can scan down the column
 * to see "what I'm already in" at a glance.
 *
 * "+ Create collection" lives at the bottom of the popover and opens a
 * one-field Dialog. After save, the new collection is spliced into the
 * local options list AND auto-selected, so the user lands back in the
 * same form with their new folder already ticked.
 *
 * Selection state is fully controlled — toggling a row only calls
 * onChange; the parent decides what to persist and when. The picker does
 * NOT write directly to Supabase (except when creating a new collection,
 * which is a separate concern from membership).
 */
export function CollectionPicker({
  ownerId,
  value,
  onChange,
  label,
  description,
}: Props) {
  const [options, setOptions] = useState<CollectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Inline-create modal
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

  // Build a quick lookup from id → title once per options change so the
  // trigger label render doesn't loop through the full list every keystroke.
  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.id, o.title);
    return m;
  }, [options]);

  const triggerLabel = (() => {
    if (loading) return "Loading…";
    if (value.length === 0) return "Add to collections";
    if (value.length === 1) {
      // Use the option title if we know it; otherwise fall back to "1
      // collection" so we never render an empty string while titles refresh.
      return titleById.get(value[0]!) ?? "1 collection";
    }
    return `${value.length} collections`;
  })();

  const toggle = (id: string) => {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    );
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
    onChange([...value, data.id]);
    setModalOpen(false);
    setNewTitle("");
    toast.success(`Created "${data.title}"`);
  };

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={loading}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Folders className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {/* The list is intentionally lightweight — no Command primitive,
              no search — because creators usually have < 20 collections and
              a simple list reads faster than a search field at that scale.
              The whole popover sits inside its own scroll container so
              long lists never push the page chrome. */}
          <ul className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                No collections yet. Create one below to get started.
              </li>
            )}
            {options.map((o) => {
              const checked = value.includes(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => toggle(o.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left text-sm",
                      "hover:bg-accent/15 focus:bg-accent/15 focus:outline-none transition-colors"
                    )}
                  >
                    <span
                      className={cn(
                        "h-4 w-4 rounded-sm border flex items-center justify-center shrink-0",
                        checked
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input"
                      )}
                      aria-hidden="true"
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{o.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setNewTitle("");
                setModalOpen(true);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm text-primary",
                "hover:bg-primary/10 focus:bg-primary/10 focus:outline-none transition-colors"
              )}
            >
              <Plus className="h-4 w-4" />
              Create collection
            </button>
          </div>
        </PopoverContent>
      </Popover>

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
