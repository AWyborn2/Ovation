/**
 * The editor's dock: the column docked beside the canvas that holds every
 * settings panel and menu, so none of them ever covers the card or slide being
 * edited (New Studio, "it should never block the creative").
 *
 * Inside a New Studio editor, a menu that would float over the canvas (a
 * popover, the font list, the field suggestions) shows in the dock instead,
 * and a menu that is already in the dock opens in place. Outside an editor
 * (a component rendered on its own) each menu floats as it always has.
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** The dock's width (px): the same as the left-hand panel. */
export const DOCK_WIDTH = 340;

type DockApi = {
  /** Where docked menus render, at the top of the dock. */
  node: HTMLElement | null;
  /** A menu says it is open (or closed), so the dock shows while any is. */
  claim: (id: string, open: boolean) => void;
};

const DockContext = createContext<DockApi | null>(null);
/** True inside the dock itself: a menu there opens in place. */
const InDockContext = createContext(false);

/** The editor's side of the dock: who has a menu open, and where menus go. */
export function useDockState() {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState<ReadonlySet<string>>(() => new Set());
  const claim = useCallback((id: string, open: boolean) => {
    setClaims((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const api = useMemo<DockApi>(() => ({ node, claim }), [node, claim]);
  return { api, menuOpen: claims.size > 0, setMenuNode: setNode };
}

export function DockProvider({ api, children }: { api: DockApi; children: ReactNode }) {
  return <DockContext.Provider value={api}>{children}</DockContext.Provider>;
}

/** Marks its children as inside the dock: their menus open in place. */
export function InDock({ children }: { children: ReactNode }) {
  return <InDockContext.Provider value>{children}</InDockContext.Provider>;
}

/**
 * Where an open menu goes: `"dock"` (with the node to render it into) inside
 * an editor, `"inline"` inside the dock itself, `"float"` everywhere else.
 */
export function useDockTarget(
  open: boolean,
): { mode: "dock"; node: HTMLElement | null } | { mode: "inline" } | { mode: "float" } {
  const dock = useContext(DockContext);
  const inDock = useContext(InDockContext);
  const id = useId();
  const docked = !!dock && !inDock;
  const claim = dock?.claim;
  useEffect(() => {
    if (!docked || !claim) return;
    claim(id, open);
    return () => claim(id, false);
  }, [docked, claim, id, open]);
  if (inDock) return { mode: "inline" };
  if (dock) return { mode: "dock", node: dock.node };
  return { mode: "float" };
}

/**
 * Renders an open menu where it belongs: into the dock in an editor, in place
 * inside the dock, or floating (`floatClassName`, positioned as before)
 * anywhere else. `className` applies in every mode.
 */
export function DockedMenu({
  open,
  className,
  floatClassName,
  children,
  ...rest
}: {
  open: boolean;
  className?: string;
  floatClassName?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">) {
  const target = useDockTarget(open);
  if (!open) return null;
  if (target.mode === "float")
    return (
      <div className={cn(floatClassName, className)} {...rest}>
        {children}
      </div>
    );
  const box = (
    <div className={cn("relative w-full", className)} {...rest}>
      {children}
    </div>
  );
  if (target.mode === "inline") return box;
  return target.node ? createPortal(box, target.node) : null;
}

/* A popover that opens in the dock. A drop-in for the ui popover's parts. */

type PopoverState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  contentId: string;
};

const DockPopoverContext = createContext<PopoverState | null>(null);

export function DockPopover({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const dock = useContext(DockContext);
  const inDock = useContext(InDockContext);
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOwn(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentId = useId();
  const state = useMemo(
    () => ({ open, setOpen, triggerRef, contentId }),
    [open, setOpen, contentId],
  );
  // Outside an editor, the floating popover, unchanged.
  if (!dock || inDock)
    return (
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    );
  return <DockPopoverContext.Provider value={state}>{children}</DockPopoverContext.Provider>;
}

export const DockPopoverTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof PopoverTrigger>
>(function DockPopoverTrigger({ onClick, ...props }, ref) {
  const state = useContext(DockPopoverContext);
  if (!state) return <PopoverTrigger ref={ref} onClick={onClick} {...props} />;
  const { asChild, ...rest } = props;
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      {...rest}
      ref={(el: HTMLButtonElement | null) => {
        state.triggerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      type={asChild ? undefined : "button"}
      aria-haspopup="dialog"
      aria-expanded={state.open}
      aria-controls={state.open ? state.contentId : undefined}
      data-state={state.open ? "open" : "closed"}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);
        if (!e.defaultPrevented) state.setOpen(!state.open);
      }}
    />
  );
});

/** Inside a popover in the dock, a pointer down here doesn't close it (a nested floating layer). */
const NESTED = "[data-radix-popper-content-wrapper], [role='dialog'], [role='alertdialog']";

export const DockPopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof PopoverContent>
>(function DockPopoverContent(props, ref) {
  const state = useContext(DockPopoverContext);
  if (!state) return <PopoverContent ref={ref} {...props} />;
  return <DockedPopoverBody ref={ref} state={state} {...props} />;
});

const DockedPopoverBody = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof PopoverContent> & { state: PopoverState }
>(function DockedPopoverBody(
  {
    state,
    className,
    children,
    // Positioning props are for the floating popover only.
    align: _align,
    side: _side,
    sideOffset: _sideOffset,
    alignOffset: _alignOffset,
    avoidCollisions: _avoid,
    collisionPadding: _padding,
    onOpenAutoFocus: _autoFocus,
    onCloseAutoFocus: _closeFocus,
    onEscapeKeyDown,
    onPointerDownOutside,
    onInteractOutside,
    onFocusOutside: _focusOutside,
    forceMount: _force,
    asChild: _asChild,
    ...rest
  },
  ref,
) {
  const { open, setOpen, triggerRef, contentId } = state;
  const target = useDockTarget(open);
  const box = useRef<HTMLDivElement | null>(null);
  const node = target.mode === "dock" ? target.node : null;

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const ev = e as unknown as Parameters<NonNullable<typeof onEscapeKeyDown>>[0];
      onEscapeKeyDown?.(ev);
      if (e.defaultPrevented) return;
      close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || box.current?.contains(t) || triggerRef.current?.contains(t)) return;
      if (t instanceof Element && t.closest(NESTED) && !box.current?.contains(t.closest(NESTED)))
        return;
      const ev = e as unknown as Parameters<NonNullable<typeof onPointerDownOutside>>[0];
      onPointerDownOutside?.(ev);
      onInteractOutside?.(ev);
      if (e.defaultPrevented) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, setOpen, triggerRef, onEscapeKeyDown, onPointerDownOutside, onInteractOutside]);

  // Focus moves into the menu as it opens, as the floating popover's does.
  useEffect(() => {
    if (!open || !node) return;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: false });
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, node]);

  if (!open || !node) return null;
  return createPortal(
    <div
      {...rest}
      ref={(el) => {
        box.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      id={contentId}
      role="dialog"
      tabIndex={-1}
      data-state="open"
      data-docked=""
      className={cn(
        "w-full rounded-lg border border-[var(--ed-line)] bg-[var(--ed-panel)] p-4 text-[var(--ed-ink)] outline-none",
        className,
        // Docked, it takes the dock's width whatever width it floats at.
        "!w-full",
      )}
    >
      {children}
    </div>,
    node,
  );
});
