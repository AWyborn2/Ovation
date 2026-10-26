import {
  resolveKioskDisplay,
  type ResolvedKioskDisplay,
  type ResolvedKioskLook,
} from "@workspace/scorecard/kiosk-display";
import type {
  HonourDisplaySettings,
  KioskAd,
  KioskPhotoSlideshow,
  KioskSlideshowPhoto,
  Sponsor,
} from "@workspace/api-client-react";
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
      /** A photo background from one of the club's slideshows (P2). */
      backdrop?: BoardBackdrop;
    }
  // A sponsor slide: `sponsor` set → one large sponsor; null → grid of all.
  | { kind: "sponsor"; key: string; sponsor: Sponsor | null }
  | { kind: "ad"; key: string; ad: KioskAd }
  // A photo slideshow: the server-picked photos; the player shows `perPass` a
  // pass, or one for a photo interlude.
  | {
      kind: "photos";
      key: string;
      slideshow: KioskPhotoSlideshow;
      photos: KioskSlideshowPhoto[];
      interlude?: boolean;
    };

/** A board's photo background: the slideshow's photos and the panel strength. */
export interface BoardBackdrop {
  slideshowId: string;
  photos: KioskSlideshowPhoto[];
  dim: "light" | "medium" | "strong";
}

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
  /** The photo slideshow definitions, and the photos the server picked for each. */
  slideshows?: KioskPhotoSlideshow[];
  slideshowPhotos?: Record<string, KioskSlideshowPhoto[]>;
  /** Auto-insert a sponsor slide after every N boards. */
  sponsorSlides: boolean;
}

/**
 * A board with its resolved display settings, column groups and, when its
 * photo background's slideshow has photos, that backdrop.
 */
export function boardItem(
  board: DisplayBoard,
  settings: Pick<HonourDisplaySettings, "boardConfigs">,
  look: ResolvedKioskLook,
  key: string,
  slideshowPhotos?: Record<string, KioskSlideshowPhoto[]>,
): RotationItem {
  const cfg = settings.boardConfigs?.[board.id];
  const display = resolveKioskDisplay(board, cfg, look);
  const headings = boardColumnHeadings(board);
  const bg = cfg?.photoBackground;
  const bgPhotos = bg ? (slideshowPhotos?.[bg.slideshowId] ?? []) : [];
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
    ...(bg && bgPhotos.length
      ? {
          backdrop: { slideshowId: bg.slideshowId, photos: bgPhotos, dim: bg.dim ?? "medium" },
        }
      : {}),
  };
}

/**
 * The rotation the TV plays. The admin's sequence holds board ids and placement
 * tokens ("sponsor" for a sponsor slide, "ad:<id>" for an advert, "photos:<id>"
 * for a photo slideshow, skipped while it has no photos); empty means
 * every board in order. When sponsor slides are on, one is also inserted after
 * every N boards (and at least once). A "single" sponsor style shows each
 * sponsor on its own slide in turn. A slideshow with `interludeEvery` set also
 * shows one of its photos after every N boards (photo interludes).
 */
export function buildRotation(input: RotationInput): RotationItem[] {
  const { boards, settings, look, sponsors, ads, sponsorSlides } = input;
  const slideshows = input.slideshows ?? [];
  if (!boards.length) return [];
  const byId = new Map(boards.map((b) => [b.id, b]));
  const seq = settings.kioskSequence?.length ? settings.kioskSequence : boards.map((b) => b.id);
  const every = Math.max(1, settings.kioskSponsorSlideEvery ?? 3);
  const single = settings.kioskSponsorSlideStyle === "single";
  const out: RotationItem[] = [];
  let boardCount = 0;
  let autoCount = 0;
  const interludes = slideshows.filter(
    (s) => s.interludeEvery && (input.slideshowPhotos?.[s.id]?.length ?? 0) > 0,
  );

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
    if (id.startsWith("photos:")) {
      const slideshow = slideshows.find((s) => s.id === id);
      const photos = input.slideshowPhotos?.[id] ?? [];
      if (slideshow && photos.length) {
        out.push({ kind: "photos", key: `seq-photos:${i}`, slideshow, photos });
      }
      return;
    }
    const board = byId.get(id);
    if (!board) return;
    out.push(boardItem(board, settings, look, `board:${board.id}:${i}`, input.slideshowPhotos));
    boardCount++;
    if (sponsorSlides && boardCount % every === 0) pushSponsor(`auto-sponsor:${autoCount++}`);
    for (const s of interludes) {
      if (boardCount % s.interludeEvery! === 0) {
        out.push({
          kind: "photos",
          key: `interlude:${s.id}:${i}`,
          slideshow: s,
          photos: input.slideshowPhotos![s.id]!,
          interlude: true,
        });
      }
    }
  });

  if (sponsorSlides && autoCount === 0 && out.some((f) => f.kind === "board")) {
    pushSponsor("auto-sponsor:0");
  }
  return out;
}

/**
 * The photos one pass of a slideshow shows: `perPass` of them (one for an
 * interlude), a fresh random pick each pass, or otherwise working down the
 * list (newest or the picked order) from `cursor`, the number of this
 * slideshow's photos shown so far.
 */
export function slideshowPass(
  item: Extract<RotationItem, { kind: "photos" }>,
  cursor: number,
  random: () => number = Math.random,
): KioskSlideshowPhoto[] {
  const { photos, slideshow } = item;
  const n = item.interlude ? 1 : Math.min(Math.max(1, slideshow.perPass), photos.length);
  if (slideshow.order === "random") {
    const pool = [...photos];
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(random() * (k + 1));
      [pool[k], pool[j]] = [pool[j]!, pool[k]!];
    }
    return pool.slice(0, n);
  }
  const start = cursor % photos.length;
  return Array.from({ length: n }, (_, k) => photos[(start + k) % photos.length]!);
}
