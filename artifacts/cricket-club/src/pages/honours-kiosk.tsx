import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetHonourDisplay,
  useGetKioskDisplay,
  getGetHonourDisplayQueryKey,
  getGetKioskDisplayQueryKey,
} from "@workspace/api-client-react";
import { BoardRenderer } from "@/components/honours-display/BoardRenderer";
import { SponsorStrip, SponsorSlide } from "@/components/honours-display/SponsorAds";
import { rootStyle } from "@/components/honours-display/theme";
import { skinClass } from "@/components/honours-display/types";
import type { DisplayBoard } from "@/components/honours-display/types";
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
      transition: "scroll" | "slide";
      fit: boolean;
      key: string;
    }
  | { kind: "sponsor"; key: string };

/**
 * Estimated height (px) reserved at the bottom of the screen for the persistent
 * sponsor strip. Shared between the CSS var (`--kiosk-strip-h`) and the
 * rows-per-page math so paginated boards never slide under the strip.
 */
const KIOSK_STRIP_PX = 96;

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
  const { data, refetch } = kioskToken ? tokenQ : adminQ;
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
  // Both modes need at least one active sponsor to render anything.
  const activeSponsors = data?.activeSponsors ?? [];
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

  // Resolve the kiosk sequence into the ordered list of boards to show.
  const sequence = useMemo(() => {
    if (!boards.length || !settings) return [] as DisplayBoard[];
    const byId = new Map(boards.map((b) => [b.id, b]));
    const seq = (settings.kioskSequence ?? [])
      .map((id) => byId.get(id))
      .filter((b): b is DisplayBoard => b != null);
    return seq.length ? seq : boards;
  }, [boards, settings]);

  // Flatten the sequence into individual frames: a "scroll" board is one frame
  // (credit-scrolled); a "slide" board is paginated into screen-sized frames.
  // When sponsor slides are on, a full-screen sponsor frame is interleaved after
  // every N *boards* (counted at the sequence level, so a paginated board counts
  // once) — and at least once if the sequence is shorter than N.
  const frames = useMemo<Frame[]>(() => {
    const out: Frame[] = [];
    const every = Math.max(1, settings?.kioskSponsorSlideEvery ?? 3);
    let sponsorCount = 0;
    sequence.forEach((b, i) => {
      const fit = b.display.fit;
      if (b.display.transition === "slide") {
        paginate(b, rowsPerPage).forEach((pb, j) =>
          out.push({
            kind: "board",
            board: pb,
            transition: "slide",
            fit,
            key: `${b.id}:slide:${j}`,
          }),
        );
      } else {
        out.push({
          kind: "board",
          board: b,
          transition: "scroll",
          fit,
          key: `${b.id}:scroll`,
        });
      }
      if (sponsorSlidesOn && (i + 1) % every === 0) {
        out.push({ kind: "sponsor", key: `sponsor:${sponsorCount++}` });
      }
    });
    if (sponsorSlidesOn && sponsorCount === 0 && out.length > 0) {
      out.push({ kind: "sponsor", key: "sponsor:0" });
    }
    return out;
  }, [sequence, rowsPerPage, sponsorSlidesOn, settings?.kioskSponsorSlideEvery]);

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

    // Sponsor frames hold like slides (no credit-scroll); board frames keep
    // their own transition. (A sponsor frame has no `.hb-board` anyway.)
    const cur = frames[index % frames.length];
    const isSlide = !cur || cur.kind === "sponsor" || cur.transition === "slide";
    const fr = frameRef.current?.querySelector<HTMLElement>(".hb-board");
    if (frameRef.current) stagger(frameRef.current);
    if (fr) fr.scrollTop = 0;

    timerRef.current = setTimeout(() => {
      if (!alive()) return;
      if (!isSlide && fr) {
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
      if (index + 1 >= frames.length) refetch();
      setIndex((i) => (i + 1) % frames.length);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, frames, DWELL, ENDHOLD, SPEED]);

  if (!data || !settings || !brand || !frames.length) {
    return (
      <div className="hb-kiosk flex items-center justify-center text-white">
        <div className="text-sm opacity-70">Preparing honour boards…</div>
      </div>
    );
  }

  const skin = settings.defaultTemplate;
  const current = frames[index % frames.length]!;
  const isSponsorFrame = current.kind === "sponsor";
  const fit = isSponsorFrame ? true : current.fit;
  // The persistent strip is redundant on a full-screen sponsor slide, so hide it
  // (and don't reserve its space) while a sponsor slide is showing.
  const showStrip = sponsorStripOn && !isSponsorFrame;

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
          {isSponsorFrame ? (
            <SponsorSlide sponsors={activeSponsors} brand={brand} />
          ) : (
            <BoardRenderer
              board={current.board}
              brand={brand}
              kiosk
              cfg={settings.boardConfigs?.[current.board.id.split("#")[0]!]}
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
