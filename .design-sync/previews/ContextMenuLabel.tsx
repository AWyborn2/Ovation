import * as React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
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

export function PlayerRowMenu() {
  const ref = useAutoContextMenu<HTMLDivElement>();
  return (
    <div style={{ minHeight: 360, padding: 24 }}>
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <div
            ref={ref}
            className="flex h-24 w-[420px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
          >
            Right-click a player row…
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>M. Reid — 1st Grade</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem>View career stats</ContextMenuItem>
          <ContextMenuItem>Edit player</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuLabel inset>Move to grade</ContextMenuLabel>
          <ContextMenuItem inset>2nd Grade</ContextMenuItem>
          <ContextMenuItem inset>3rd Grade</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
