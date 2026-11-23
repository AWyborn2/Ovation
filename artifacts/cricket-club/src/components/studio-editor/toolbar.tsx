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
  type LucideIcon,
} from "lucide-react";
import type { FreeLayer } from "@/lib/pack-render";
import type { ReorderMove } from "./document";
import type { Alignment, MatchDimension, MatchReference } from "./arrange";
import { ArrangeMenu } from "./arrange-menu";
import { TokenTextInput, type TokenField } from "./token-text-input";
import { cn } from "@/lib/utils";

/** A toolbar button: never under the 32px minimum target either way. */
const btn =
  "flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)] disabled:pointer-events-none disabled:opacity-35";

/** Colours offered in the toolbar, all from the pack's own tokens so cards stay on brand. */
const SWATCHES: { label: string; value: string }[] = [
  { label: "Accent", value: "var(--gold)" },
  { label: "Light", value: "inherit" },
  { label: "Dark", value: "var(--ink)" },
  { label: "Panel", value: "var(--panel)" },
];

/**
 * The quick colours for a text or shape layer: a custom colour and the
 * pack's swatches. The older editor shows them in its toolbar; the New
 * Studio shows them in the layer's Edit panel, well away from the toolbar's
 * Edit and Position, so a slightly-off click can't recolour the layer.
 */
export function QuickColours({
  layer,
  onColour,
  size = "sm",
}: {
  layer: FreeLayer;
  onColour: (colour: string) => void;
  /** "md": 32px targets (the Edit panel). */
  size?: "sm" | "md";
}) {
  const current = layer.kind === "text" ? layer.style?.color : layer.style?.background;
  const swatch = size === "md" ? "h-8 w-8" : "h-6 w-6";
  return (
    <div className={cn("flex items-center", size === "md" ? "gap-2" : "gap-1")}>
      <input
        type="color"
        aria-label="Custom colour"
        className={cn(
          "cursor-pointer rounded border border-[var(--ed-line)] bg-transparent",
          size === "md" ? "h-8 w-8" : "h-7 w-7",
        )}
        onChange={(e) => onColour(e.target.value)}
      />
      <div
        className={cn("flex items-center px-1", size === "md" ? "gap-2" : "gap-1")}
        role="group"
        aria-label="Colour"
      >
        {SWATCHES.map((s) => (
          <button
            key={s.label}
            type="button"
            aria-label={s.label}
            title={s.label}
            aria-pressed={current === s.value}
            onClick={() => onColour(s.value)}
            className={cn(
              swatch,
              "rounded-full border border-[var(--ed-line)]",
              current === s.value && "ring-2 ring-[var(--ed-accent)]",
            )}
            style={{ background: s.value === "inherit" ? "var(--ed-ink)" : s.value }}
          />
        ))}
      </div>
    </div>
  );
}

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
  tools,
  hint = true,
}: {
  selected: FreeLayer[];
  isGroup: boolean;
  /** The text box for a text, sticker or medal layer; left out, the toolbar has none. */
  onText?: (text: string) => void;
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
  /**
   * The New Studio's own buttons, first in the bar: each opens its panel in
   * the slot beside the rail (Replace for a photo, Edit, Position).
   */
  tools?: ToolbarTool[];
  /** With nothing selected, say how to start (the older editor). */
  hint?: boolean;
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
    if (!hint)
      return <div className="flex h-11 items-center gap-2 px-3">{canPaste && pasteBtn}</div>;
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
  const newStudio = !!tools;
  return (
    <div
      role="toolbar"
      aria-label="Layer tools"
      className={cn(
        "flex min-h-11 max-w-full flex-wrap items-center rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] px-1.5 py-1 shadow-[0_24px_48px_-16px_rgba(0,0,0,.7)]",
        newStudio ? "gap-1.5" : "gap-1",
      )}
    >
      {tools && tools.length > 0 && (
        <>
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(btn, t.active && "bg-[var(--ed-card)] text-[var(--ed-accent)]")}
              aria-pressed={t.active}
              onClick={t.onClick}
            >
              <t.icon className="h-4 w-4" aria-hidden /> {t.label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-[var(--ed-line)]" aria-hidden />
        </>
      )}
      {single ? (
        <>
          {single.bind && (
            <span className="rounded-full bg-[var(--ed-accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--ed-on-accent)]">
              Live · {single.name?.replace(/^Live · /, "") ?? single.bind}
            </span>
          )}
          {onText &&
            (single.kind === "text" || single.kind === "sticker" || single.kind === "medal") &&
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
          {/* The New Studio has its colours in the Edit panel, never beside Edit / Position. */}
          {!newStudio && (single.kind === "text" || single.kind === "shape") && (
            <QuickColours layer={single} onColour={onColour} />
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

/** A New Studio toolbar button: it opens its panel beside the rail. */
export type ToolbarTool = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** Its panel is the one open. */
  active?: boolean;
};

export type PageColourProps = {
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
/** The page colours offered: white, black, the club's colours and its stage colour. */
function pageColourOptions(swatches: PageColourProps["swatches"]) {
  return [
    { label: "White", value: "#FFFFFF", show: "#FFFFFF" },
    { label: "Black", value: "#000000", show: "#000000" },
    { label: "Club colour", value: "var(--gold)", show: swatches.gold },
    { label: "Club panel", value: "var(--panel)", show: swatches.panel },
    {
      label: "Club stage (the card's own)",
      value: undefined,
      show: `linear-gradient(135deg, ${swatches.panel}, #111111)`,
    },
  ] as { label: string; value: string | undefined; show: string }[];
}

/**
 * The page colours as a list (New Studio's Edit page panel): every option on
 * show, no menu to open, so nothing opens over the canvas.
 */
export function PageColourOptions({
  background,
  onBackground,
  swatches,
  onPicked,
}: PageColourProps & { onPicked?: () => void }) {
  const options = pageColourOptions(swatches);
  const hex = background && background.startsWith("#") ? background.slice(0, 7) : "#ffffff";
  return (
    <div role="group" aria-label="Page colours" className="flex flex-col gap-1">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={o.value === background}
          onClick={() => {
            onBackground(o.value);
            onPicked?.();
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
  );
}

function PageColour({ background, onBackground, swatches }: PageColourProps) {
  const [open, setOpen] = useState(false);
  const options = pageColourOptions(swatches);
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
        <div className="absolute left-0 top-10 z-20 w-56 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] p-2 shadow-xl">
          <PageColourOptions
            background={background}
            onBackground={onBackground}
            swatches={swatches}
            onPicked={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
