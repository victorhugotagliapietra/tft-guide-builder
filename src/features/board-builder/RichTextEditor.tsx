import { memo, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
};

function ToolbarButton({
  isActive,
  onClick,
  children,
  title,
}: {
  isActive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep editor focused
      onClick={onClick}
      title={title}
      className={cn(
        "h-6 w-6 rounded flex items-center justify-center transition-colors",
        isActive
          ? "bg-foreground/15 text-foreground"
          : "text-muted-foreground/60 hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// Debounce window for onChange emissions while the user is actively typing.
// Long enough that "type a sentence" only triggers ~1-2 upstream re-renders,
// short enough that pause-then-blur feels responsive. onBlur always flushes
// any pending value immediately so saves never lose the last keystroke.
const ONCHANGE_DEBOUNCE_MS = 250;

/**
 * Minimal rich text editor (TipTap) with Bold / Italic / Bullet list.
 * - Auto-grows vertically (no scrollbar)
 * - Debounces onChange emissions so upstream state (and the heavy editor
 *   subtree above us) doesn't re-render on every keystroke
 * - onBlur synchronously flushes the pending value, so external code that
 *   reads state on submit always sees the latest HTML
 * - Re-syncs when `value` changes externally (e.g. when loading from API)
 */
function RichTextEditorImpl({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}: Props) {
  // The latest onChange/onBlur from the parent. Keeping these in refs lets us
  // construct stable TipTap handlers — TipTap captures handlers ONCE at editor
  // creation time and we don't want a fresh editor for every parent render.
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  // Pending HTML waiting to be flushed via debounced onChange.
  const pendingHtmlRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingHtmlRef.current !== null) {
      const html = pendingHtmlRef.current;
      pendingHtmlRef.current = null;
      onChangeRef.current(html);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
        emptyEditorClass:
          "before:content-[attr(data-placeholder)] before:text-muted-foreground/50 before:pointer-events-none before:float-left before:h-0",
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      pendingHtmlRef.current = editor.getHTML();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(flush, ONCHANGE_DEBOUNCE_MS);
    },
    onBlur: () => {
      // Flush any pending change BEFORE notifying parent of blur, so onBlur
      // callbacks that persist state see the most-recent HTML.
      flush();
      onBlurRef.current?.();
    },
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none text-sm py-2 px-3 min-h-[64px]",
          "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
          "[&_strong]:font-semibold",
          "[&_em]:italic",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
          "[&_li]:my-0.5 [&_li>p]:my-0"
        ),
      },
    },
  });

  // Ensure a pending change is committed before this editor instance unmounts
  // (route change, step removal, etc.). Without this the user can lose the
  // last <250ms of typing if they navigate away mid-debounce.
  useEffect(() => {
    return () => {
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resync from outside (e.g., when an API load resets the form)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    // Avoid clobbering caret position when value hasn't changed semantically
    if (current !== value && !(current === "<p></p>" && value === "")) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-md border border-input bg-background/60 min-h-[96px]",
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background/60 focus-within:ring-1 focus-within:ring-ring transition-shadow",
        className
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-border/40 px-1 py-0.5">
        <ToolbarButton
          title="Bold (Ctrl+B)"
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic (Ctrl+I)"
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Bullet list"
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

// Memoize the editor — TipTap re-creating its instance on every parent render
// is the worst-case scenario. The wrapper re-renders only when `value` or
// `placeholder` actually change identity; the parent's onChange identity is
// captured via ref inside so it doesn't bust the memo.
export const RichTextEditor = memo(RichTextEditorImpl, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.placeholder === next.placeholder &&
    prev.className === next.className
  );
});

/**
 * Read-only renderer for HTML produced by RichTextEditor.
 * Uses the same prose styling.
 */
export const RichTextContent = memo(function RichTextContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed",
        // overflow-wrap:anywhere lets long unbroken strings (URLs, run-on
        // text, accidental "asdfasdfasdfasdfasdf...") wrap to the next
        // line instead of forcing a horizontal scrollbar on the page.
        // min-w-0 is the companion fix for the parent flex container — a
        // child default of min-width:auto would otherwise refuse to shrink
        // and re-create the same overflow.
        "min-w-0 [overflow-wrap:anywhere]",
        "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
        "[&_li]:my-0.5 [&_li>p]:my-0",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
