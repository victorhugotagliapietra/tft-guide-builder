import { Link } from "@tanstack/react-router";
import { Globe, Lock } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyLinkButton } from "@/components/copy-link-button";
import { htmlExcerpt } from "@/lib/html-text";
import type { GuideSummary } from "./types";

type Props = {
  guide: GuideSummary & { slug?: string | null };
  // "public" → link goes to /g/<slug> (read-only viewer)
  // "owner"  → link goes to /guides/<id>/edit and shows draft/published badge
  variant?: "public" | "owner";
  // Whether to render a "Copy link" action in the card header. Hidden on
  // owner-variant draft guides (there's nothing to share yet).
  showCopyLink?: boolean;
};

/**
 * Shared guide preview card used on landing, profile, collection, and
 * dashboard pages. Centralizing it keeps the visual language consistent and
 * lets future tweaks (cover art, hover state, badge ordering) land in one
 * place instead of three.
 *
 * The description is always stripped to plain text before display — guide
 * descriptions are stored as TipTap-produced HTML, and dumping raw markup
 * into a card showed up as visible `<p>` tags before this pass.
 *
 * The "owner" variant is the only one that surfaces draft state — public
 * viewers never see drafts at all because the queries that feed them filter
 * `is_public = true` upstream.
 */
export function GuideCard({ guide, variant = "public", showCopyLink = true }: Props) {
  const showDraftBadge = variant === "owner";
  const canCopy = showCopyLink && guide.slug && (variant === "public" || guide.is_public);
  const cardInner = (
    <Card className="hover:border-primary/50 transition-colors h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight line-clamp-2">{guide.title}</CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            {showDraftBadge &&
              (guide.is_public ? (
                <Badge variant="default">
                  <Globe className="h-3 w-3 mr-1" /> Published
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <Lock className="h-3 w-3 mr-1" /> Draft
                </Badge>
              ))}
            {canCopy && guide.slug && (
              <CopyLinkButton
                href={`/g/${guide.slug}`}
                iconOnly
                variant="ghost"
                stopPropagation
              />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {guide.tft_set && <Badge variant="outline">Set {guide.tft_set}</Badge>}
          {guide.patch && <Badge variant="outline">Patch {guide.patch}</Badge>}
          <Badge variant="outline">{guide.difficulty}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {htmlExcerpt(guide.description) || "No description yet."}
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
