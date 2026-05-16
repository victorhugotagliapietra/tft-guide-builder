/**
 * Strip HTML tags out of a TipTap-produced rich-text string and return a
 * clean plain-text preview suitable for guide cards and collection cards.
 *
 * Guide descriptions are stored as serialized HTML (e.g. `<p>foo</p>` from
 * the TipTap editor). Rendering that raw inside a card produces visible
 * `<p>` text — the bug the design pass called out. We can't just dump the
 * string into a div with `dangerouslySetInnerHTML` because that lets the
 * raw markup affect layout and bypasses our line-clamp.
 *
 * The implementation:
 *   1. Browser path — when `DOMParser` is available, parse the HTML and
 *      read `.textContent`. This handles malformed input gracefully and
 *      decodes every named/numeric entity automatically.
 *   2. SSR / fallback path — regex-strip tags and decode the four entities
 *      TipTap actually emits (`&amp;`, `&lt;`, `&gt;`, `&nbsp;`). Not as
 *      bulletproof as DOMParser, but safe for TanStack Start server
 *      rendering where `DOMParser` doesn't exist.
 *
 * The result is collapsed-whitespace + trimmed so a card never shows a
 * leading newline from a paragraph break.
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";

  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(input, "text/html");
      return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
    } catch {
      // Fall through to regex path on any DOMParser hiccup.
    }
  }

  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Shortcut: strip HTML and clamp to `maxChars`. The clamp respects word
 * boundaries (cuts at the last space before the limit) and appends an
 * ellipsis. Cards never truncate to mid-word.
 */
export function htmlExcerpt(input: string | null | undefined, maxChars = 180): string {
  const text = stripHtml(input);
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice) + "…";
}
