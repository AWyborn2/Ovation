import { slot } from "../shared";

/** Fit a complete 2:1 logo inside the existing tile without changing its size. */
export function sponsorLogoFrame(key: string, maxHeight: number): string {
  return `<div data-sponsor-logo-frame="1" style="width:100%;max-width:${maxHeight * 2}cqmin;aspect-ratio:2 / 1;flex:none">${slot(key, "sponsor")}</div>`;
}
