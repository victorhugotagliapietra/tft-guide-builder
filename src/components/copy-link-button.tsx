import { useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  // Either a relative path ("/g/foo") or absolute URL. Relative is resolved
  // against the current origin so the same caller works in dev + prod.
  href: string;
  // Optional label override; defaults to "Copy link".
  label?: string;
  // Compact icon-only variant for use inside dense card headers.
  iconOnly?: boolean;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost";
  // Stop click from bubbling — useful when the button sits inside a card
  // that's itself a link (which is the common case on guide/collection cards).
  stopPropagation?: boolean;
  className?: string;
};

/**
 * One-click copy of a shareable URL with a transient check-mark state.
 *
 * Visual feedback is the LinkIcon → Check swap for ~1.4s plus a toast,
 * which gives the user two confirmation signals (immediate + persistent).
 * Both are important: the swap is instant but disappears, the toast
 * lingers but takes ~50ms to render — together they cover both perceptual
 * latency cases.
 */
export function CopyLinkButton({
  href,
  label = "Copy link",
  iconOnly = false,
  size = "sm",
  variant = "ghost",
  stopPropagation = true,
  className,
}: Props) {
  const [copied, setCopied] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    const fullUrl =
      typeof window === "undefined"
        ? href
        : new URL(href, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      // Reset after a beat so a second click reads as a fresh action.
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Couldn't copy — clipboard access denied");
    }
  };

  const Icon = copied ? Check : LinkIcon;

  return (
    <Button
      type="button"
      size={iconOnly ? "icon" : size}
      variant={variant}
      onClick={onClick}
      className={cn(iconOnly ? "h-8 w-8" : "", className)}
      aria-label={label}
      title={label}
    >
      <Icon className={cn("h-4 w-4", !iconOnly && "mr-1.5")} />
      {!iconOnly && (copied ? "Copied!" : label)}
    </Button>
  );
}
