import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Link as LinkIcon, Copy } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useTFTData } from "@/features/tft-data/use-tft-data";
import { generatePlannerCode, type PlannerCodeMap } from "@/features/tft-data/planner-code";
import type { TFTChampion } from "@/features/tft-data/types";
import {
  boardStepSchema,
  STEP_TYPE_LABELS,
  emptyAugmentSlots,
  type BoardStep,
} from "@/features/board-builder/types";
import { ReadOnlyBoardGrid } from "@/features/board-builder/ReadOnlyBoardGrid";
import { TraitsPanel } from "@/features/board-builder/TraitsPanel";
import { ReadOnlyAugmentSlotsPanel } from "@/features/board-builder/AugmentSlotsPanel";
import { RichTextContent } from "@/features/board-builder/RichTextEditor";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/g/$slug")({
  component: PublicGuide,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const boardStepsSchema = z.array(boardStepSchema);

type GuideData = {
  title: string;
  description: string;
  tft_set: string;
  patch: string;
  playstyle: string;
  difficulty: "easy" | "medium" | "hard";
  final_comp_notes: string;
  steps: BoardStep[];
};

type PageState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ok"; guide: GuideData };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/**
 * Shared class for rich-text content displayed on this page.
 *
 * - `text-foreground/90` (was `text-muted-foreground`) lifts body text to
 *   ~90% white on the dark theme — readable while still softer than headings.
 * - `text-[15px]` is a deliberate small bump from RichTextContent's baked-in
 *   text-sm (14px). cn() + tailwind-merge resolves the conflict cleanly.
 * - `leading-7` (28px line height) instead of just `leading-relaxed` so long-
 *   form coaching paragraphs don't feel cramped at the now-wider step note
 *   container (which spans the trio width below the board).
 * - `[&_p]:my-3` paragraph spacing override — RichTextContent's base has
 *   `[&_p]:my-1` which works for a sidebar block but reads as a wall of text
 *   in the wider container. tailwind-merge picks the later spacing.
 * - Used by guide-level description, final-comp notes, and per-step notes.
 */
const NOTES_TEXT_CLASS =
  "text-foreground/90 text-[15px] leading-7 [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0";

/**
 * Approximate width of the Traits | Board | Augments trio inside an
 * expanded step. The notes block below the trio uses this as its
 * `maxWidth` so the two visually align — notes feel like a continuation
 * of the board section instead of a free-floating block.
 *
 * Derived as: TraitsPanel (208px) + gap (12px) + HEX_CONTAINER_W (~780px)
 * + gap (12px) + AugmentSlotsPanel (150px) = 1162px, padded to 1180.
 * Hand-tuned rather than computed so layout regressions are easier to spot.
 */
const STEP_CONTENT_MAX_WIDTH = 1180;

// ---------------------------------------------------------------------------
// Read-only step card
//
// Layout shifts based on `expanded`:
//   - Collapsed: a single-row title bar with chevron, badge, level, and a
//     Copy-Code button on the right (always visible — promoted out of the
//     old footer per spec).
//   - Expanded: a 3-column flex (Traits | Board | Augments + Notes), mirroring
//     the editor's flanked-board layout. Reused components: TraitsPanel,
//     ReadOnlyBoardGrid, ReadOnlyAugmentSlotsPanel, RichTextContent.
// ---------------------------------------------------------------------------

function ReadOnlyStepCard({
  step,
  setNumber,
  plannerCodeMap,
  championMap,
  defaultExpanded,
}: {
  step: BoardStep;
  setNumber: number;
  plannerCodeMap: PlannerCodeMap;
  championMap: Map<string, TFTChampion>;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  function handleCopyPlannerCode(e: React.MouseEvent) {
    e.stopPropagation(); // keep the toggle from firing when clicking inside the header
    const result = generatePlannerCode(
      step.units,
      setNumber,
      plannerCodeMap,
      (apiName) => {
        const c = championMap.get(apiName);
        return c ? { cost: c.cost } : undefined;
      }
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    navigator.clipboard.writeText(result.code).then(
      () => toast.success("Board code copied!"),
      () => toast.error("Failed to write to clipboard.")
    );
  }

  const unitCount = step.units.length;
  // Defensive: older guides saved before the augments field existed get an
  // empty slot array via the zod default; this just guards against shape
  // mismatch if the schema changes again.
  const augments = Array.isArray(step.augments) ? step.augments : emptyAugmentSlots();

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card/50">
      {/* Header — chevron + title + meta on the left, copy-code on the right */}
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-3 select-none transition-colors hover:bg-muted/30",
          expanded && "border-b border-border"
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
        >
          <span className="shrink-0 text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
          <span className="font-medium text-base flex-1 truncate text-foreground">
            {step.title}
          </span>
          <Badge variant="outline" className="text-xs shrink-0">
            {STEP_TYPE_LABELS[step.stepType]}
          </Badge>
          <span className="text-xs text-foreground/70 shrink-0">Lv{step.level}</span>
          {!expanded && unitCount > 0 && (
            <span className="text-xs text-foreground/60 shrink-0">
              {unitCount} unit{unitCount !== 1 ? "s" : ""}
            </span>
          )}
        </button>

        {/* Copy Board Code — promoted from the old expanded footer to the
            step header so it's always reachable, regardless of expand state.
            Disabled when there are no units to encode. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 h-7 gap-1.5 text-xs"
          disabled={unitCount === 0}
          onClick={handleCopyPlannerCode}
          title={unitCount === 0 ? "No champions to encode" : "Copy planner code"}
        >
          <LinkIcon className="h-3.5 w-3.5" />
          Copy board code
        </Button>
      </div>

      {/* Expanded content. Layout pass 3 (viewer-only):
            Row 1 — Traits | Board | Augments (flanked trio, matches editor)
            Row 2 — Notes block BELOW, spanning the trio's full width
          Both rows are constrained to ~1180px and centered, so the trio
          stays balanced and the notes feel like a continuation of the
          board section rather than a sidebar.
          STEP_CONTENT_MAX_WIDTH is the approximate trio width:
            TraitsPanel (w-52 = 208px)
            + gap-3 (12px)
            + Board (HEX_CONTAINER_W ≈ 780px)
            + gap-3 (12px)
            + AugmentSlotsPanel (2×72 + 6 gap = 150px)
            ≈ 1162px → padded to 1180px for breathing room.
          */}
      {expanded && (
        <div className="p-4">
          {unitCount === 0 ? (
            <p className="text-sm text-foreground/70 italic">
              No units on this board.
            </p>
          ) : (
            <div
              className="mx-auto space-y-4"
              style={{ maxWidth: STEP_CONTENT_MAX_WIDTH }}
            >
              {/* Trio: Traits | Board | Augments. flex-wrap + justify-center
                  so the row stays centered when it fits and degrades to a
                  vertical stack on narrow viewports. */}
              <div className="flex flex-wrap items-start justify-center gap-3 overflow-x-auto">
                <TraitsPanel units={step.units} />
                <div className="shrink-0 rounded-lg">
                  <ReadOnlyBoardGrid units={step.units} />
                </div>
                <ReadOnlyAugmentSlotsPanel slots={augments} />
              </div>

              {/* Notes BELOW the board, spanning the trio's full width.
                  Padding bumped (px-6 py-5) for the larger text + line
                  height; the rounded card visually attaches to the board
                  section as a continuation rather than a sidebar. */}
              {step.description && (
                <div className="rounded-lg border border-border/40 bg-muted/15 px-6 py-5">
                  <RichTextContent
                    html={step.description}
                    className={NOTES_TEXT_CLASS}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PublicGuide() {
  const { slug } = Route.useParams();
  const [state, setState] = useState<PageState>({ status: "loading" });
  const { setNumber: cdnSetNumber, plannerCodeMap, championMap } = useTFTData();

  useEffect(() => {
    supabase
      .from("guides")
      .select(
        "title, description, tft_set, patch, playstyle, difficulty, final_comp_notes, board_steps"
      )
      .eq("slug", slug)
      .eq("is_public", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setState({ status: "missing" });
          return;
        }
        const parsed = boardStepsSchema.safeParse(data.board_steps);
        setState({
          status: "ok",
          guide: {
            title: data.title,
            description: data.description ?? "",
            tft_set: data.tft_set ?? "",
            patch: data.patch ?? "",
            playstyle: data.playstyle ?? "",
            difficulty: data.difficulty,
            final_comp_notes: data.final_comp_notes ?? "",
            steps: parsed.success ? parsed.data : [],
          },
        });
      });
  }, [slug]);

  // Update document title when guide loads
  useEffect(() => {
    if (state.status === "ok") {
      document.title = `${state.guide.title} — TFT Guides`;
      return () => {
        document.title = "TFT Guides — Build & Share Teamfight Tactics Comps";
      };
    }
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </main>
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center px-4 text-center">
          <div>
            <p className="text-5xl mb-4">🔒</p>
            <h1 className="text-2xl font-semibold">Guide not found</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              This guide may be private or no longer exist.
            </p>
            <Link to="/" className="text-primary hover:underline mt-4 inline-block text-sm">
              Back to home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { guide } = state;

  // Prefer the guide's own set number; fall back to CDragon's detected set
  const setNumber = parseInt(guide.tft_set, 10) || cdnSetNumber;

  // Expand only the first three steps by default to avoid an overwhelming wall of grids
  const stepsWithExpanded = guide.steps.map((step, i) => ({
    step,
    defaultExpanded: i < 3,
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      {/* Match the creator page's outer width (max-w-[90rem]) so the guide
          view feels equally immersive instead of constrained to a narrow
          reading column. Body padding stays the same; only the upper bound
          on width changes. */}
      <main className="flex-1 mx-auto max-w-[90rem] w-full px-4 py-10 space-y-8">
        {/* Guide header */}
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {guide.tft_set && (
                <Badge variant="secondary">Set {guide.tft_set}</Badge>
              )}
              {guide.patch && (
                <Badge variant="outline">Patch {guide.patch}</Badge>
              )}
              <Badge variant="outline">
                {DIFFICULTY_LABELS[guide.difficulty] ?? guide.difficulty}
              </Badge>
              {guide.playstyle && (
                <Badge variant="outline">{guide.playstyle}</Badge>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() =>
                navigator.clipboard
                  .writeText(window.location.href)
                  .then(() => toast.success("Link copied!"))
                  .catch(() => toast.error("Failed to copy link"))
              }
            >
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </Button>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            {guide.title}
          </h1>
          {guide.description && (
            <RichTextContent html={guide.description} className={NOTES_TEXT_CLASS} />
          )}
        </header>

        {/* Final comp notes */}
        {guide.final_comp_notes && (
          <section aria-labelledby="notes-heading" className="space-y-2">
            <h2 id="notes-heading" className="text-lg font-semibold">
              Final comp notes
            </h2>
            <div className="rounded-lg border border-border bg-muted/15 px-4 py-3">
              <RichTextContent
                html={guide.final_comp_notes}
                className={NOTES_TEXT_CLASS}
              />
            </div>
          </section>
        )}

        {/* Board steps */}
        <section aria-labelledby="steps-heading" className="space-y-3">
          <h2 id="steps-heading" className="text-lg font-semibold">
            Board steps
            {guide.steps.length > 0 && (
              <span className="ml-2 text-sm font-normal text-foreground/60">
                ({guide.steps.length})
              </span>
            )}
          </h2>

          {guide.steps.length === 0 ? (
            <p className="text-sm text-foreground/70 italic">
              No board steps have been added to this guide.
            </p>
          ) : (
            <div className="space-y-3">
              {stepsWithExpanded.map(({ step, defaultExpanded }) => (
                <ReadOnlyStepCard
                  key={step.id}
                  step={step}
                  setNumber={setNumber}
                  plannerCodeMap={plannerCodeMap}
                  championMap={championMap}
                  defaultExpanded={defaultExpanded}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Built with TFT Guides
      </footer>
    </div>
  );
}
