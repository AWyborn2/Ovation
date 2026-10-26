import {
  resolveKioskDisplay,
  type ResolvedKioskDisplay,
  type ResolvedKioskLook,
} from "@workspace/scorecard/kiosk-display";
import type { HonourDisplaySettings, KioskAd, Sponsor } from "@workspace/api-client-react";
import type { DisplayBoard } from "../types";
import { boardColumnHeadings, splitColumnGroups, type ColumnGroup } from "./column-groups";

/** One item of the kiosk rotation. */
export type RotationItem =
  | {
      kind: "board";
      key: string;
      board: DisplayBoard;
      display: ResolvedKioskDisplay;
      /** Screens the board's columns split into (one when they all fit). */
      groups: ColumnGroup[];
    }
  // A sponsor slide: `sponsor` set → one large sponsor; null → grid of all.
  | { kind: "sponsor"; key: string; sponsor: Sponsor | null }
  | { kind: "ad"; key: string; ad: KioskAd };

export interface RotationInput {
  boards: DisplayBoard[];
  settings: Pick<
    HonourDisplaySettings,
    "kioskSequence" | "boardConfigs" | "kioskSponsorSlideEvery" | "kioskSponsorSlideStyle"
  >;
  look: ResolvedKioskLook;
  /** The sponsors chosen for the kiosk (already filtered to active + chosen). */
  sponsors: Sponsor[];
  ads: KioskAd[];
  /** Auto-insert a sponsor slide after every N boards. */
  sponsorSlides: boolean;
}

/** A board with its resolved display settings and column groups. */
export function boardItem(
  board: DisplayBoard,
  settings: Pick<HonourDisplaySettings, "boardConfigs">,
  look: ResolvedKioskLook,
  key: string,
): RotationItem {
  const display = resolveKioskDisplay(board, settings.boardConfigs?.[board.id], look);
  const headings = boardColumnHeadings(board);
  return {
    kind: "board",
    key,
    // A leaderboard shows its "Show top" count on the TV.
    board:
      board.layout === "leaderboard"
        ? { ...board, entries: board.entries.slice(0, display.top) }
        : board,
    display,
    groups: headings.length
      ? splitColumnGroups(headings.length, display.columnsPerScreen)
      : [{ start: 0, count: 0 }],
  };
}

/**
 * The rotation the TV plays. The admin's sequence holds board ids and placement
 * tokens ("sponsor" for a sponsor slide, "ad:<id>" for an advert); empty means
 * every board in order. When sponsor slides are on, one is also inserted after
 * every N boards (and at least once). A "single" sponsor style shows each
 * sponsor on its own slide in turn.
 */
export function buildRotation(input: RotationInput): RotationItem[] {
  const { boards, settings, look, sponsors, ads, sponsorSlides } = input;
  if (!boards.length) return [];
  const byId = new Map(boards.map((b) => [b.id, b]));
  const seq = settings.kioskSequence?.length ? settings.kioskSequence : boards.map((b) => b.id);
  const every = Math.max(1, settings.kioskSponsorSlideEvery ?? 3);
  const single = settings.kioskSponsorSlideStyle === "single";
  const out: RotationItem[] = [];
  let boardCount = 0;
  let autoCount = 0;

  const pushSponsor = (keyBase: string) => {
    if (!sponsors.length) return;
    if (single) {
      sponsors.forEach((s, k) =>
        out.push({ kind: "sponsor", key: `${keyBase}:${s.id}:${k}`, sponsor: s }),
      );
    } else {
      out.push({ kind: "sponsor", key: keyBase, sponsor: null });
    }
  };

  seq.forEach((id, i) => {
    if (id === "sponsor") {
      pushSponsor(`seq-sponsor:${i}`);
      return;
    }
    if (id.startsWith("ad:")) {
      const ad = ads.find((a) => a.id === id);
      if (ad) out.push({ kind: "ad", key: `seq-ad:${i}`, ad });
      return;
    }
    const board = byId.get(id);
    if (!board) return;
    out.push(boardItem(board, settings, look, `board:${board.id}:${i}`));
    boardCount++;
    if (sponsorSlides && boardCount % every === 0) pushSponsor(`auto-sponsor:${autoCount++}`);
  });

  if (sponsorSlides && autoCount === 0 && out.some((f) => f.kind === "board")) {
    pushSponsor("auto-sponsor:0");
  }
  return out;
}
