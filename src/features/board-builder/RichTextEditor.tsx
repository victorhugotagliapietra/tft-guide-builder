import { useEffect } from "react";
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

/**
 * Minimal rich text editor (TipTap) with Bold / Italic / Bullet list.
 * - Auto-grows vertically (no scrollbar)
 * - Emits HTML on every change via onChange
 * - Re-syncs when `value` changes externally (e.g. when loading from API)
 */
export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}: Props) {
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
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onBlur: () => onBlur?.(),
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

/**
 * Read-only renderer for HTML produced by RichTextEditor.
 * Uses the same prose styling.
 */
export function RichTextContent({
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
}
