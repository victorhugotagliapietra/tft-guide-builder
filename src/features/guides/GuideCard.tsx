import { Link } from "@tanstack/react-router";
import { Globe, Lock } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GuideSummary } from "./types";

type Props = {
  guide: GuideSummary & { slug?: string | null };
  // "public" → link goes to /g/<slug> (read-only viewer)
  // "owner"  → link goes to /guides/<id>/edit and shows draft/published badge
  variant?: "public" | "owner";
};

/**
 * Shared guide preview card used on landing, profile, collection, and
 * dashboard pages. Centralizing it keeps the visual language consistent and
 * lets future tweaks (cover art, hover state, badge ordering) land in one
 * place instead of three.
 *
 * The "owner" variant is the only one that surfaces draft state — public
 * viewers never see drafts at all because the queries that feed them filter
 * `is_public = true` upstream.
 */
export function GuideCard({ guide, variant = "public" }: Props) {
  const showDraftBadge = variant === "owner";
  const cardInner = (
    <Card className="hover:border-primary/50 transition-colors h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight line-clamp-2">{guide.title}</CardTitle>
          {showDraftBadge &&
            (guide.is_public ? (
              <Badge variant="default" className="shrink-0">
                <Globe className="h-3 w-3 mr-1" /> Published
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">
                <Lock className="h-3 w-3 mr-1" /> Draft
              </Badge>
            ))}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {guide.tft_set && <Badge variant="outline">Set {guide.tft_set}</Badge>}
          {guide.patch && <Badge variant="outline">Patch {guide.patch}</Badge>}
          <Badge variant="outline">{guide.difficulty}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {guide.description || "No description yet."}
        </p>
        {variant === "owner" && (
          <p className="text-xs text-muted-foreground mt-3">
            Updated {format(new Date(guide.updated_at), "MMM d, yyyy")}
          </p>
        )}
      </CardContent>
    </Card>
  );

  // Owner variant goes to the editor; public goes to the viewer. The cast on
  // `to` is needed because TanStack's typed router doesn't accept dynamic
  // string interpolation for path params without the params helper, but
  // params here are statically scoped to one of two known routes.
  if (variant === "owner") {
    return (
      <Link to="/guides/$id/edit" params={{ id: guide.id }} className="block h-full">
        {cardInner}
      </Link>
    );
  }
  return (
    <Link to="/g/$slug" params={{ slug: guide.slug ?? "" }} className="block h-full">
      {cardInner}
    </Link>
  );
}
