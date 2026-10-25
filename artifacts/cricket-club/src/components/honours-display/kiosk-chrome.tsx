import { createContext, useContext } from "react";

/**
 * What the TV player knows about the screen a board is on, for the skins that
 * show it (the Classic Honour Board's page dots and footer). Off the kiosk
 * there is none, and the board renders exactly as before.
 */
export interface KioskChrome {
  /** Page dots: shown when a board turns pages. */
  page?: { index: number; count: number };
  /** "Board N of M" in the footer. */
  position?: { index: number; count: number };
}

export const KioskChromeContext = createContext<KioskChrome | null>(null);

export function useKioskChrome(): KioskChrome | null {
  return useContext(KioskChromeContext);
}

/** Page dots for the board header (nothing for a one-page board). */
export function KioskPageDots() {
  const page = useKioskChrome()?.page;
  if (!page || page.count < 2) return null;
  return (
    <div className="hb-kp-dots" aria-label={`Page ${page.index + 1} of ${page.count}`}>
      {Array.from({ length: page.count }, (_, i) => (
        <i key={i} className={i === page.index ? "on" : undefined} />
      ))}
    </div>
  );
}

/** The board footer: "Board N of M". */
export function KioskBoardFooter() {
  const position = useKioskChrome()?.position;
  if (!position) return null;
  return (
    <footer className="hb-kp-foot">
      <span />
      <span>
        Board <b>{position.index + 1}</b> of <b>{position.count}</b>
      </span>
    </footer>
  );
}
