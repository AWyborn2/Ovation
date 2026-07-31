import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetHonourDisplay,
  useGetKioskDisplay,
  getGetHonourDisplayQueryKey,
  getGetKioskDisplayQueryKey,
} from "@workspace/api-client-react";
import { BoardRenderer } from "@/components/honours-display/BoardRenderer";
import {
  SponsorStrip,
  SponsorSlide,
  SponsorSlideSingle,
  AdSlide,
} from "@/components/honours-display/SponsorAds";
import { rootStyle } from "@/components/honours-display/theme";
import { skinClass } from "@/components/honours-display/types";
import type { DisplayBoard } from "@/components/honours-display/types";
import type { Sponsor, KioskAd } from "@workspace/api-client-react";
import {
  useApproachingBoard,
  applyBoardConfig,
} from "@/components/honours-display/useApproachingBoard";
import "@/styles/honour-boards.css";

/** Stagger the row-reveal animation across a freshly shown board. */
function stagger(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      ".row, .hb-flag, .hb-lineup-row, .hb-cell, tr",
    )
    .forEach((el, i) => {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "hb-rowin .6s ease both " + Math.min(i * 70, 2200) + "ms";
    });
}

/**
 * A single kiosk frame. Either one board (possibly a paginated slice of a larger
 * one) or a full-screen sponsor slide rotated in between boards.
 */
type Frame =
  | {
      kind: "board";
      board: DisplayBoard;
      mode: "scroll" | "slide" | "wrap";
      fit: boolean;
      key: string;
    }
  // A sponsor frame: `sponsor` set → one large sponsor; null → grid of all.
  | { kind: "sponsor"; key: string; sponsor: Sponsor | null }
  | { kind: "ad"; key: string; ad: KioskAd };

/**
 * Estimated height (px) reserved at the bottom of the screen for the persistent
 * sponsor strip. Shared between the CSS var (`--kiosk-strip-h`) and the
 * rows-per-page math so paginated boards never slide under the strip.
 */
const KIOSK_STRIP_PX = 96;

/**
 * Minimum age of the display feed before a carousel wrap-around re-fetches it.
 * `refetch()` bypasses staleTime, so without this guard an unattended TV would
 * hit the API on every rotation; with it the kiosk still picks up new results
 * within ~10 minutes of them landing, without a reload.
 */
const KIOSK_REFRESH_MS = 10 * 60 * 1000;

/** Approximate how many list rows fit one screen (recomputed on resize). */
function computeRowsPerPage(stripPx = 0): number {
  const h = typeof window !== "undefined" ? window.innerHeight : 900;
  return Math.max(6, Math.floor((h - 220 - stripPx) / 46));
}

/**
 * Split a board into screen-sized pages for "slide" mode. List boards page by
 * entries (× column count so a multi-column board fills the page); composite
 * "columns" boards page by row window across every column. Other layouts and
 * boards that already fit return a single frame.
 */
function paginate(board: DisplayBoard, rowsPerPage: number): DisplayBoard[] {
  const per = Math.max(1, rowsPerPage);
  if (board.layout === "list") {
    const cols = Math.min(3, Math.max(1, board.display.columns));
    const perPage = per * cols;
    if (board.entries.length <= perPage) return [board];
    const pages: DisplayBoard[] = [];
    for (let i = 0; i < board.entries.length; i += perPage) {
      pages.push({
        ...board,
        id: `${board.id}#${i}`,
        entries: board.entries.slice(i, i + perPage),
      });
    }
    return pages;
  }
  if (board.layout === "columns" && board.columns) {
    const maxRows = board.columns.reduce((m, c) => Math.max(m, c.entries.length), 0);
    if (maxRows <= per) return [board];
    const pages: DisplayBoard[] = [];
    for (let r = 0; r < maxRows; r += per) {
      pages.push({
        ...board,
        id: `${board.id}#${r}`,
        columns: board.columns.map((c) => ({
          ...c,
          entries: c.entries.slice(r, r + per),
        })),
      });
    }
    return pages;
  }
  if (board.layout === "grid" && board.grid) {
    const rows = board.grid.rows;
    if (rows.length <= per) return [board];
    const pages: DisplayBoard[] = [];
    for (let r = 0; r < rows.length; r += per) {
      pages.push({
        ...board,
        id: `${board.id}#${r}`,
        grid: { ...board.grid, rows: rows.slice(r, r + per) },
      });
    }
    return pages;
  }
  return [board];
}

export default function HonoursKiosk() {
  // A kiosk token (issued by an admin) drives the public, login-free kiosk feed
  // for a fixed clubroom TV. It arrives via the short `/tv/:token` path, or the
  // legacy `?token=` query for older saved links. Without one we're the in-app
  // admin preview.
  const routeParams = useParams<{ token?: string }>();
  const kioskToken = useMemo(
    () =>
      routeParams.token ??
      new URLSearchParams(window.location.search).get("token"),
    [routeParams.token],
  );
  const adminQ = useGetHonourDisplay({
    query: { enabled: !kioskToken, queryKey: getGetHonourDisplayQueryKey() },
  });
  const tokenQ = useGetKioskDisplay(
    { token: kioskToken ?? "" },
    {
      query: {
        enabled: !!kioskToken,
        queryKey: getGetKioskDisplayQueryKey({ token: kioskToken ?? "" }),
      },
    },
  );
  const { data, refetch, dataUpdatedAt } = kioskToken ? tokenQ : adminQ;
  const approachingBoard = useApproachingBoard();
  const [, navigate] = useLocation();
  const [index, setIndex] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => computeRowsPerPage());

  const boards = useMemo(() => {
    const base = data?.boards ?? [];
    if (!approachingBoard) return base;
    return [...base, applyBoardConfig(approachingBoard, data?.settings?.boardConfigs)];
  }, [data?.boards, data?.settings, approachingBoard]);
  const settings = data?.settings;
  const brand = data?.brand;

  // Sponsor advertising (admin-toggleable, independent of share-card sponsors).
  // The admin may show only a subset of active sponsors (empty = all).
  const allSponsors = data?.activeSponsors ?? [];
  const chosenIds = settings?.kioskSponsorIds ?? [];
  const activeSponsors =
    chosenIds.length > 0
      ? allSponsors.filter((s) => chosenIds.includes(s.id))
      : allSponsors;
  const ads = settings?.kioskAds ?? [];
  const slideStyle = settings?.kioskSponsorSlideStyle ?? "grid";
  // Both modes need at least one (chosen) active sponsor to render anything.
  const sponsorStripOn = !!settings?.kioskSponsorStrip && activeSponsors.length > 0;
  const sponsorSlidesOn = !!settings?.kioskSponsorSlides && activeSponsors.length > 0;
  const stripPx = sponsorStripOn ? KIOSK_STRIP_PX : 0;

  // Recompute how many list rows fit a screen on resize and whenever the sponsor
  // strip toggles (the strip steals vertical space from paginated boards).
  useEffect(() => {
    const onResize = () => setRowsPerPage(computeRowsPerPage(stripPx));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [stripPx]);

  const DWELL = settings?.kioskDwellMs ?? 3500;
  const ENDHOLD = settings?.kioskEndHoldMs ?? 3000;
  const SPEED = settings?.kioskScrollSpeed ?? 36;

  // Boards by id, and the ordered sequence of items to show. The sequence can
  // hold board ids AND placement tokens ("sponsor", "ad:<id>") so admins can
  // drop sponsor slides / ad creatives at chosen positions. Empty = all boards.
  const byId = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);
  const items = useMemo<string[]>(() => {
    if (!boards.length || !settings) return [];
    const seq = settings.kioskSequence ?? [];
    return seq.length ? seq : boards.map((b) => b.id);
  }, [boards, settings]);

  // Flatten the sequence into individual frames. A "scroll" board is one frame
  // (credit-scrolled); a "slide" board is paginated into screen-sized frames; a
  // "wrap" grid board is one frame (fills the screen via side-by-side blocks).
  // Sponsor slides appear at explicit "sponsor" tokens AND, when enabled, are
  // auto-interleaved after every N boards. Sponsor slides honour the chosen
  // style (one grid of all sponsors, or one large sponsor per slide rotating).
  const frames = useMemo<Frame[]>(() => {
    const out: Frame[] = [];
    const every = Math.max(1, settings?.kioskSponsorSlideEvery ?? 3);
    let boardCount = 0;
    let autoCount = 0;

    const pushSponsor = (keyBase: string) => {
      if (activeSponsors.length === 0) return;
      if (slideStyle === "single") {
        activeSponsors.forEach((s, k) =>
          out.push({ kind: "sponsor", key: `${keyBase}:${s.id}:${k}`, sponsor: s }),
        );
      } else {
        out.push({ kind: "sponsor", key: keyBase, sponsor: null });
      }
    };

    items.forEach((id, i) => {
      if (id === "sponsor") {
        pushSponsor(`seq-sponsor:${i}`);
        return;
      }
      if (id.startsWith("ad:")) {
        const ad = ads.find((a) => a.id === id);
        if (ad) out.push({ kind: "ad", key: `seq-ad:${i}`, ad });
        return;
      }
      const b = byId.get(id);
      if (!b) return;
      const fit = b.display.fit;
      const t = b.display.transition;
      if (t === "slide") {
        paginate(b, rowsPerPage).forEach((pb, j) =>
          out.push({ kind: "board", board: pb, mode: "slide", fit, key: `${b.id}:slide:${j}` }),
        );
      } else if (t === "wrap") {
        out.push({ kind: "board", board: b, mode: "wrap", fit, key: `${b.id}:wrap` });
      } else {
        out.push({ kind: "board", board: b, mode: "scroll", fit, key: `${b.id}:scroll` });
      }
      boardCount++;
      if (sponsorSlidesOn && boardCount % every === 0) {
        pushSponsor(`auto-sponsor:${autoCount++}`);
      }
    });

    if (sponsorSlidesOn && autoCount === 0 && out.some((f) => f.kind === "board")) {
      pushSponsor("auto-sponsor:0");
    }
    return out;
  }, [
    items,
    byId,
    rowsPerPage,
    sponsorSlidesOn,
    slideStyle,
    activeSponsors,
    ads,
    settings?.kioskSponsorSlideEvery,
  ]);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleRef = useRef(0);

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // Token kiosks (clubroom TV) have no admin to return to — just leave
    // fullscreen and stay on the rotation. Admin previews go back to the display.
    if (!kioskToken) navigate("/honours-display");
  };

  // Enter fullscreen on first user interaction (browsers block auto-fullscreen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the rotation: dwell, then either credit-scroll (scroll frames) or just
  // hold (slide frames already fit), then advance + refetch on wrap.
  useEffect(() => {
    if (!frames.length) return;
    cycleRef.current += 1;
    const myCycle = cycleRef.current;
    const alive = () => cycleRef.current === myCycle;

    // Only "scroll" boards credit-scroll; slide/wrap boards and sponsor/ad
    // frames just hold. (Sponsor/ad frames have no `.hb-board` anyway.)
    const cur = frames[index % frames.length];
    const isSlide = !cur || cur.kind !== "board" || cur.mode !== "scroll";
    const fr = frameRef.current?.querySelector<HTMLElement>(".hb-board");
    if (frameRef.current) stagger(frameRef.current);
    if (fr) fr.scrollTop = 0;

    timerRef.current = setTimeout(() => {
      if (!alive()) return;
      if (!isSlide && fr) {
        // Re-measure the (now fully settled) title height so the frozen heading
        // row pins flush beneath it. Fonts and the crest image have loaded by
        // the time the dwell elapses, so this corrects any early mis-measure
        // that would otherwise leave a gap the top rows scroll through.
        const head = fr.querySelector<HTMLElement>(".hb-head");
        if (head) {
          fr.style.setProperty(
            "--hb-head-h",
            `${Math.round(head.getBoundingClientRect().height)}px`,
          );
        }
        const dist = fr.scrollHeight - fr.clientHeight;
        if (dist > 10) {
          const dur = (dist / SPEED) * 1000;
          const t0 = performance.now();
          const scroll = (now: number) => {
            if (!alive()) return;
            const p = Math.min((now - t0) / dur, 1);
            fr.scrollTop = dist * (p < 0.04 ? (p * p) / 0.04 : p); // soft start
            if (p < 1) {
              rafRef.current = requestAnimationFrame(scroll);
            } else {
              timerRef.current = setTimeout(advance, ENDHOLD);
            }
          };
          rafRef.current = requestAnimationFrame(scroll);
          return;
        }
      }
      // Slide frame, or a scroll frame that already fits: just hold then advance.
      timerRef.current = setTimeout(advance, ENDHOLD);
    }, DWELL);

    function advance() {
      if (!alive()) return;
      // Refresh the feed on wrap-around, but only when the data is actually
      // old — refetch() ignores staleTime, and a rotation can wrap every few
      // minutes on a small board set.
      if (
        index + 1 >= frames.length &&
        Date.now() - dataUpdatedAt >= KIOSK_REFRESH_MS
      ) {
        refetch();
      }
      setIndex((i) => (i + 1) % frames.length);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, frames, DWELL, ENDHOLD, SPEED]);

  // The board title and its column-heading row are pinned (CSS `position:
  // sticky`) so they stay legible while a board credit-scrolls. The heading row
  // sticks *below* the title, so publish the title's live height as
  // `--hb-head-h` for the sticky heading's `top` offset — re-measured per frame
  // and on any resize of the (viewport-scaled) title.
  useEffect(() => {
    const board = frameRef.current?.querySelector<HTMLElement>(".hb-board");
    const head = board?.querySelector<HTMLElement>(".hb-head");
    if (!board || !head) return;
    // getBoundingClientRect() is sub-pixel accurate and reflects the settled
    // layout; a ResizeObserver keeps it current as fonts/crest load or the
    // viewport changes the (clamped) title size.
    const measure = () =>
      board.style.setProperty(
        "--hb-head-h",
        `${Math.round(head.getBoundingClientRect().height)}px`,
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(head);
    return () => ro.disconnect();
  }, [index, frames]);

  if (!data || !settings || !brand || !frames.length) {
    return (
      <div className="hb-kiosk flex items-center justify-center text-white">
        <div className="text-sm opacity-70">Preparing honour boards…</div>
      </div>
    );
  }

  const skin = settings.defaultTemplate;
  const current = frames[index % frames.length]!;
  const isOverlayFrame = current.kind !== "board";
  // Always render boards (and overlay slides) at full screen width — the
  // narrow centred preset is no longer used on the kiosk.
  const fit = true;
  // The persistent strip is redundant on a full-screen sponsor/ad slide, so
  // hide it (and don't reserve its space) while one is showing.
  const showStrip = sponsorStripOn && !isOverlayFrame;
  // A video ad that fails to decode/load must not blank the unattended kiosk
  // for the rest of its dwell — advance immediately instead. Reuses the same
  // index update `advance()` uses in the rotation effect above; the effect's
  // own cleanup clears the now-stale dwell timer when `index` changes.
  const advanceOnAdError = () => setIndex((i) => (i + 1) % frames.length);

  return (
    <div
      className="hb-kiosk"
      style={
        showStrip
          ? ({ "--kiosk-strip-h": `${KIOSK_STRIP_PX}px` } as CSSProperties)
          : undefined
      }
    >
      <div className={`hb ${skinClass(skin)}`} style={rootStyle(brand, settings)}>
        <div className={`preset active${fit ? " fit" : ""}`} ref={frameRef}>
          {current.kind === "sponsor" ? (
            current.sponsor ? (
              <SponsorSlideSingle sponsor={current.sponsor} brand={brand} />
            ) : (
              <SponsorSlide sponsors={activeSponsors} brand={brand} />
            )
          ) : current.kind === "ad" ? (
            <AdSlide ad={current.ad} onError={advanceOnAdError} />
          ) : (
            <BoardRenderer
              board={current.board}
              brand={brand}
              kiosk
              cfg={settings.boardConfigs?.[current.board.id.split("#")[0]!]}
              skins={settings.skins}
            />
          )}
        </div>
      </div>
      {showStrip && <SponsorStrip sponsors={activeSponsors} />}
      <button className="hb-kexit" onClick={exit}>
        ✕ Exit kiosk (Esc)
      </button>
    </div>
  );
}
