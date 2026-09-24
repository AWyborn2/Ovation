import { useEffect } from "react";

export const LEAVE_MESSAGE = "You have unsaved changes. Leave without saving?";

/**
 * While `dirty`, ask before leaving (Social Studio U22): the browser's own
 * prompt on reload/close, and a confirm on in-app link clicks. Links are
 * caught in the capture phase on `document`, ahead of wouter's click handler,
 * so a declined confirm stops the navigation outright.
 */
export function useLeaveGuard(dirty: boolean, message = LEAVE_MESSAGE) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page (e.g. an in-page #anchor) is not leaving.
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
