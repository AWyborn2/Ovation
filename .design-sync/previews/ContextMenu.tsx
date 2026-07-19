import * as React from "react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@workspace/cricket-club";

/** Radix context menus have no open/defaultOpen prop — fire a real
 *  contextmenu event on mount so the menu renders open for capture. */
function useAutoContextMenu<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 96,
        clientY: r.top + 48,
      }),
    );
  }, []);
  return ref;
}

export function MatchRowMenu() {
  const ref = useAutoContextMenu<HTMLDivElement>();
  return (
    <div style={{ minHeight: 400, padding: 24 }}>
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <div
            ref={ref}
            className="flex h-28 w-[460px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
          >
            Right-click a match row…
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-60">
          <ContextMenuLabel>Round 8 vs Pinjarra</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem>
            Open scorecard
            <ContextMenuShortcut>⌘O</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>Edit match details</ContextMenuItem>
          <ContextMenuItem>Export CSV</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem checked>Verified result</ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive">Delete import</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
