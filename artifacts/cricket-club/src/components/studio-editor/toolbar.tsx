import { useState } from "react";
import {
  ArrowDown,
  BookmarkPlus,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Group,
  Lock,
  Trash2,
  Ungroup,
  Unlock,
} from "lucide-react";
import type { FreeLayer } from "@/lib/pack-render";
import type { ReorderMove } from "./document";
import type { Alignment, MatchDimension, MatchReference } from "./arrange";
import { ArrangeMenu } from "./arrange-menu";
import { TokenTextInput, type TokenField } from "./token-text-input";
import { cn } from "@/lib/utils";

const btn =
  "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)] disabled:pointer-events-none disabled:opacity-35";

/** Colours offered in the toolbar, all from the pack's own tokens so cards stay on brand. */
const SWATCHES: { label: string; value: string }[] = [
  { label: "Accent", value: "var(--gold)" },
  { label: "Light", value: "inherit" },
  { label: "Dark", value: "var(--ink)" },
  { label: "Panel", value: "var(--panel)" },
];

/**
 * The floating contextual toolbar (Social Studio U16): text content and colour
 * for a text layer, fill for a shape, and always lock / copy / duplicate /
 * delete; group or ungroup for a multi-selection; Arrange (align, distribute,
 * match size) when the page passes it. With nothing selected it offers Paste.
 */
export function EditorToolbar({
  selected,
  isGroup,
  onText,
  onColour,
  onLock,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
  onReorder,
  onCopy,
  onPaste,
  canPaste = false,
  onSaveElement,
  page,
  arrange,
  fields,
}: {
  selected: FreeLayer[];
  isGroup: boolean;
  onText: (text: string) => void;
  onColour: (colour: string) => void;
  onLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  /** Stacking order (bring forward / send backward / to front / to back). */
  onReorder?: (move: ReorderMove) => void;
  /** Copy the selection to the editor clipboard (Ctrl/Cmd+C). */
  onCopy?: () => void;
  /** Paste the editor clipboard (Ctrl/Cmd+V). */
  onPaste?: () => void;
  canPaste?: boolean;
  /** Publish the selection to the element library (editable-elements plan, D4). */
  onSaveElement?: () => void;
  /** The page's own colour, offered with nothing selected (`TemplatePage.background`). */
  page?: PageColourProps;
  /** Align, distribute and match size; `count` is how many units can move. */
  arrange?: {
    count: number;
    onAlign: (to: Alignment) => void;
    onDistribute: (axis: "horizontal" | "vertical") => void;
    onMatch: (dim: MatchDimension, ref: MatchReference) => void;
  };
  /** The card's live fields: the text box then also searches them to insert a `{{token}}`. */
  fields?: TokenField[];
}) {
  const pasteBtn = onPaste && (
    <button
      type="button"
      className={btn}
      onClick={onPaste}
      disabled={!canPaste}
      aria-label="Paste"
      title="Paste (Ctrl+V)"
    >
      <ClipboardPaste className="h-4 w-4" />
    </button>
  );
  if (selected.length === 0) {
    return (
      <div className="flex h-11 items-center gap-2 px-3 text-sm text-[var(--ed-ink2)]">
        {page && <PageColour {...page} />}
        Select a layer to edit it, or add one from the panel.
        {canPaste && pasteBtn}
      </div>
    );
  }
  const single = selected.length === 1 ? selected[0] : null;
  const locked = selected.every((l) => l.locked);
  return (
    <div
      role="toolbar"
      aria-label="Layer tools"
      className="flex min-h-11 max-w-full flex-wrap items-center gap-1 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] px-1.5 py-1 shadow-[0_24px_48px_-16px_rgba(0,0,0,.7)]"
    >
      {single ? (
        <>
          {single.bind && (
            <span className="rounded-full bg-[var(--ed-accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--ed-on-accent)]">
              Live · {single.name?.replace(/^Live · /, "") ?? single.bind}
            </span>
          )}
          {(single.kind === "text" || single.kind === "sticker" || single.kind === "medal") &&
            !single.bind &&
            (fields && fields.length > 0 && single.kind === "text" ? (
              <TokenTextInput
                value={single.content ?? ""}
                fields={fields}
                onChange={onText}
                className="h-8 w-56 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm"
              />
            ) : (
              <input
                aria-label="Text"
                value={single.content ?? ""}
                onChange={(e) => onText(e.target.value)}
                className="h-8 w-44 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm"
              />
            ))}
          {(single.kind === "text" || single.kind === "shape") && (
            <>
              <input
                type="color"
                aria-label="Custom colour"
                className="h-7 w-7 cursor-pointer rounded border border-[var(--ed-line)] bg-transparent"
                onChange={(e) => onColour(e.target.value)}
              />
              <div className="flex items-center gap-1 px-1" role="group" aria-label="Colour">
                {SWATCHES.map((s) => {
                  const current =
                    single.kind === "text" ? single.style?.color : single.style?.background;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      aria-label={s.label}
                      aria-pressed={current === s.value}
                      onClick={() => onColour(s.value)}
                      className={cn(
                        "h-6 w-6 rounded-full border border-[var(--ed-line)]",
                        current === s.value && "ring-2 ring-[var(--ed-accent)]",
                      )}
                      style={{ background: s.value === "inherit" ? "var(--ed-ink)" : s.value }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <span className="px-2 text-sm font-semibold">
          {isGroup ? `Group · ${selected.length} layers` : `${selected.length} selected`}
        </span>
      )}
      <span className="mx-1 h-6 w-px bg-[var(--ed-line)]" aria-hidden />
      {selected.length > 1 &&
        (isGroup ? (
          <button type="button" className={btn} onClick={onUngroup}>
            <Ungroup className="h-4 w-4" aria-hidden /> Ungroup
          </button>
        ) : (
          <button type="button" className={btn} onClick={onGroup}>
            <Group className="h-4 w-4" aria-hidden /> Group
          </button>
        ))}
      <button
        type="button"
        className={btn}
        onClick={onLock}
        aria-label={locked ? "Unlock" : "Lock"}
      >
        {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </button>
      {onReorder && (
        <div className="flex items-center" role="group" aria-label="Arrange">
          <button
            type="button"
            className={btn}
            onClick={() => onReorder("front")}
            aria-label="Bring to front"
          >
            <ArrowUpToLine className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => onReorder("forward")}
            aria-label="Bring forward"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => onReorder("backward")}
            aria-label="Send backward"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => onReorder("back")}
            aria-label="Send to back"
          >
            <ArrowDownToLine className="h-4 w-4" />
          </button>
        </div>
      )}
      {arrange && (
        <ArrangeMenu
          count={arrange.count}
          onAlign={arrange.onAlign}
          onDistribute={arrange.onDistribute}
          onMatch={arrange.onMatch}
        />
      )}
      {onCopy && (
        <button
          type="button"
          className={btn}
          onClick={onCopy}
          aria-label="Copy"
          title="Copy (Ctrl+C)"
        >
          <ClipboardCopy className="h-4 w-4" />
        </button>
      )}
      {pasteBtn}
      {onSaveElement && (
        <button
          type="button"
          className={btn}
          onClick={onSaveElement}
          aria-label="Save as element"
          title="Save as element"
        >
          <BookmarkPlus className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        className={btn}
        onClick={onDuplicate}
        aria-label="Duplicate"
        title="Duplicate (Ctrl+D)"
      >
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={cn(btn, "text-[var(--ed-danger)]")}
        onClick={onDelete}
        disabled={locked}
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

type PageColourProps = {
  /** The page's colour; absent is the club's stage colour. */
  background?: string;
  onBackground: (colour: string | undefined) => void;
  /** The club's colours, to show the token swatches as they'll look. */
  swatches: { gold: string; panel: string };
};

/**
 * The page colour (editor issue 1, 26 Oct 2026): white, black, the club's
 * colours, the stage colour the card had before, or any colour picked.
 */
function PageColour({ background, onBackground, swatches }: PageColourProps) {
  const [open, setOpen] = useState(false);
  const options: { label: string; value: string | undefined; show: string }[] = [
    { label: "White", value: "#FFFFFF", show: "#FFFFFF" },
    { label: "Black", value: "#000000", show: "#000000" },
    { label: "Club colour", value: "var(--gold)", show: swatches.gold },
    { label: "Club panel", value: "var(--panel)", show: swatches.panel },
    {
      label: "Club stage (the card's own)",
      value: undefined,
      show: `linear-gradient(135deg, ${swatches.panel}, #111111)`,
    },
  ];
  const hex = background && background.startsWith("#") ? background.slice(0, 7) : "#ffffff";
  const current =
    options.find((o) => o.value === background)?.show ?? background ?? options[4]!.show;
  return (
    <div className="relative">
      <button
        type="button"
        className={btn}
        aria-label="Page colour"
        aria-expanded={open}
        title="Page colour"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          aria-hidden
          className="h-4 w-4 rounded border border-[var(--ed-line)]"
          style={{ background: current }}
        />
        Page colour
      </button>
      {open && (
        <div
          role="group"
          aria-label="Page colours"
          className="absolute left-0 top-10 z-20 flex w-56 flex-col gap-1 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] p-2 shadow-xl"
        >
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={o.value === background}
              onClick={() => {
                onBackground(o.value);
                setOpen(false);
              }}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-[var(--ed-ink)] hover:bg-[var(--ed-card)] aria-pressed:bg-[var(--ed-card)]"
            >
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 rounded border border-[var(--ed-line)]"
                style={{ background: o.show }}
              />
              {o.label}
            </button>
          ))}
          <label className="flex items-center gap-2 px-2 py-1 text-sm text-[var(--ed-ink)]">
            <input
              type="color"
              aria-label="Any colour"
              value={hex}
              onChange={(e) => onBackground(e.target.value.toUpperCase())}
              className="h-5 w-5 cursor-pointer rounded border border-[var(--ed-line)] bg-transparent p-0"
            />
            Any colour
          </label>
        </div>
      )}
    </div>
  );
}
