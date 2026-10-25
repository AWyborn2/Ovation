import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ResolvedKioskLook } from "@workspace/scorecard/kiosk-display";
import type { Sponsor } from "@workspace/api-client-react";
import { BoardRenderer } from "../board-renderer";
import { AdSlide, SponsorSlide, SponsorSlideSingle } from "../sponsor-ads";
import type { BoardDisplayConfig, DisplayBoard, HonourBrand, HonourSkin } from "../types";
import { boardColumnHeadings, columnGroupLabel, sliceBoardColumns } from "./column-groups";
import { boardRowCount, pageRanges, rowsThatFit, sliceBoardRows } from "./pages";
import { creditsDurationMs, findFitScale } from "./movement";
import {
  pickTransition,
  runTransition,
  ROW_SELECTOR,
  type ConcreteTransition,
} from "./transitions";
import type { RotationItem } from "./rotation";

/**
 * The clubroom-TV player (honours kiosk redesign, A2). Plays the rotation:
 * each board's column groups in turn, each moved by its resolved setting
 * (pages, credits roll or fit to screen), arriving with its transition.
 *
 * One async "director" loop owns the timing. React renders at most two screen
 * layers (outgoing below, incoming on top); the loop commits a screen, waits
 * for it to mount, then animates the real DOM. A page turn animates only the
 * board body (the incoming layer's board background is cleared while it
 * plays), so the header plate never moves.
 */

type BoardItem = Extract<RotationItem, { kind: "board" }>;

interface Screen {
  id: number;
  item: RotationItem;
  /** The board as shown: one column group, one page. */
  board?: DisplayBoard;
  cfg?: BoardDisplayConfig;
  /** Text scale on the body (the board's size, or smaller when fitted). */
  scale: number;
  /** Set while a page turn plays on this (incoming) layer. */
  paging?: boolean;
}

export interface KioskPlayerProps {
  items: RotationItem[];
  brand: HonourBrand;
  look: ResolvedKioskLook;
  boardConfigs?: Record<string, BoardDisplayConfig> | null;
  skins?: HonourSkin[] | null;
  /** Every chosen sponsor, for the sponsor-grid slide. */
  sponsors: Sponsor[];
  /** Called each time the rotation wraps back to the start. */
  onCycle?: () => void;
  /** Called as each rotation item starts. */
  onItem?: (item: RotationItem) => void;
  /** Called after a board is fitted to the screen (settings-screen warning). */
  onFit?: (boardId: string, scale: number, readable: boolean) => void;
  /** Treat as prefers-reduced-motion (defaults to the media query). */
  reducedMotion?: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, Math.max(0, ms));
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/** Animate `el.scrollTop` from 0 to `dist` over `ms` (soft start), until aborted. */
function scrollBody(el: HTMLElement, dist: number, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const t0 = performance.now();
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      resolve();
    };
    signal.addEventListener("abort", stop, { once: true });
    const step = (now: number) => {
      if (signal.aborted) return;
      const p = Math.min((now - t0) / ms, 1);
      el.scrollTop = dist * (p < 0.04 ? (p * p) / 0.04 : p);
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        signal.removeEventListener("abort", stop);
        resolve();
      }
    };
    raf = requestAnimationFrame(step);
  });
}

/** Board config for the renderer: size is applied by the player, and a column
 * group names its range in the subtitle. */
function screenCfg(
  item: BoardItem,
  cfg: BoardDisplayConfig | undefined,
  groupLabel: string,
): BoardDisplayConfig | undefined {
  const base: BoardDisplayConfig = { ...(cfg ?? {}) };
  delete base.textSize;
  if (groupLabel) {
    const sub = cfg?.subtitle != null ? cfg.subtitle : (item.board.subtitle ?? "");
    base.subtitle = sub ? `${sub} · ${groupLabel}` : groupLabel;
  }
  return base;
}

export function KioskPlayer(props: KioskPlayerProps) {
  const [layers, setLayers] = useState<Screen[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // Resolvers waiting for a committed screen to mount.
  const mounted = useRef(new Map<number, () => void>());
  // Aborted to cut the current item short (a video ad that fails to load).
  const skipRef = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    for (const s of layers) {
      const resolve = mounted.current.get(s.id);
      if (resolve) {
        mounted.current.delete(s.id);
        resolve();
      }
    }
  }, [layers]);

  useEffect(() => {
    const life = new AbortController();
    let nextId = 1;
    const layerEl = (id: number) =>
      stageRef.current?.querySelector<HTMLElement>(`[data-kp-screen="${id}"]`) ?? null;

    /** Show a screen on top of the current one and wait for it to mount. */
    const commit = (s: Omit<Screen, "id">): Promise<Screen> => {
      const screen: Screen = { ...s, id: nextId++ };
      return new Promise((resolve) => {
        mounted.current.set(screen.id, () => resolve(screen));
        setLayers((prev) => [...prev.slice(-1), screen]);
      });
    };
    const dropBelow = (s: Screen) =>
      setLayers((prev) => prev.filter((l) => l.id === s.id).map((l) => ({ ...l, paging: false })));
    const reduced = () => latest.current.reducedMotion ?? prefersReducedMotion();
    const choose = (t: RotationItem): ConcreteTransition =>
      t.kind === "board"
        ? pickTransition(t.display.trans, { reducedMotion: reduced() })
        : pickTransition(latest.current.look.trans, { reducedMotion: reduced() });
    const durMs = (t: RotationItem) =>
      t.kind === "board"
        ? t.display.durMs
        : ({ S: 400, M: 800, L: 1400 } as const)[latest.current.look.dur];

    /** Bring a whole screen in over whatever is showing. */
    const enter = async (s: Omit<Screen, "id">, signal: AbortSignal, t?: ConcreteTransition) => {
      const prevEl = layers0();
      const screen = await commit(s);
      await runTransition({
        host: stageRef.current,
        outgoing: prevEl,
        incoming: layerEl(screen.id),
        transition: t ?? choose(s.item),
        durationMs: durMs(s.item),
        signal,
      });
      dropBelow(screen);
      return screen;
    };
    // The element currently on top (the one the next screen replaces).
    const layers0 = () => {
      const els = stageRef.current?.querySelectorAll<HTMLElement>("[data-kp-screen]");
      return els && els.length ? els[els.length - 1]! : null;
    };

    /** Turn to the next page: only the board body moves. */
    const turnPage = async (s: Omit<Screen, "id">, signal: AbortSignal) => {
      const prevEl = layers0();
      const screen = await commit({ ...s, paging: true });
      const el = layerEl(screen.id);
      const body = el?.querySelector<HTMLElement>(".hb-body") ?? null;
      await runTransition({
        host: body,
        outgoing: prevEl?.querySelector<HTMLElement>(".hb-body-inner") ?? null,
        incoming: el?.querySelector<HTMLElement>(".hb-body-inner") ?? null,
        transition: choose(s.item),
        durationMs: durMs(s.item),
        signal,
      });
      dropBelow(screen);
      return screen;
    };

    const bodyOf = (s: Screen) => layerEl(s.id)?.querySelector<HTMLElement>(".hb-body") ?? null;
    const innerOf = (s: Screen) =>
      layerEl(s.id)?.querySelector<HTMLElement>(".hb-body-inner") ?? null;

    async function playBoard(item: BoardItem, signal: AbortSignal) {
      const d = item.display;
      const cfgs = latest.current.boardConfigs;
      const headings = boardColumnHeadings(item.board);
      const move = d.move === "credits" && reduced() ? "pages" : d.move;
      for (const group of item.groups) {
        if (signal.aborted) return;
        const grouped = headings.length ? sliceBoardColumns(item.board, group) : item.board;
        const label = item.groups.length > 1 ? columnGroupLabel(headings, group) : "";
        const listCols = grouped.layout === "list" ? d.columnsPerScreen : grouped.display.columns;
        const board: DisplayBoard = {
          ...grouped,
          display: { ...grouped.display, columns: listCols },
        };
        const base = {
          item,
          cfg: screenCfg(item, cfgs?.[item.board.id], label),
          scale: d.textScale,
        };
        const screen = await enter({ ...base, board }, signal);
        if (signal.aborted) return;

        if (move === "fit") {
          const body = bodyOf(screen);
          const inner = innerOf(screen);
          if (body && inner) {
            const { scale, readable } = findFitScale((sc) => {
              inner.style.setProperty("--hb-kp-scale", String(sc));
              return body.scrollHeight <= body.clientHeight + 1;
            }, d.textScale);
            inner.style.setProperty("--hb-kp-scale", String(scale));
            latest.current.onFit?.(item.board.id, scale, readable);
          }
          await sleep((d.pageSecs + d.hold) * 1000, signal);
          continue;
        }

        if (move === "credits") {
          await sleep(d.pageSecs * 1000, signal);
          const body = bodyOf(screen);
          if (body && !signal.aborted) {
            const dist = body.scrollHeight - body.clientHeight;
            if (dist > 4) {
              body.classList.add("hb-kp-rolling");
              await scrollBody(
                body,
                dist,
                creditsDurationMs(dist, d.speed, stageRef.current?.clientWidth ?? 1280),
                signal,
              );
            }
          }
          await sleep(d.hold * 1000, signal);
          continue;
        }

        // Pages: the board's own rows per page, or as many as fit the body.
        const rows = boardRowCount(board, d.columnsPerScreen);
        let per = d.perPage;
        if (!per) {
          const body = bodyOf(screen);
          if (body) {
            const top = body.getBoundingClientRect().top - body.scrollTop;
            const boxes = [...body.querySelectorAll<HTMLElement>(ROW_SELECTOR)].map((r) => {
              const b = r.getBoundingClientRect();
              return { top: b.top - top, bottom: b.bottom - top };
            });
            per = boxes.length ? rowsThatFit(boxes, body.clientHeight) : rows;
          } else {
            per = rows;
          }
        }
        const ranges = pageRanges(rows, per);
        if (ranges.length > 1) {
          // Swap the full board for page 1 without a transition: it shows the
          // same top rows, minus the part-row the page leaves off.
          await commit({
            ...base,
            board: sliceBoardRows(board, 0, ranges[0]![1], d.columnsPerScreen),
          });
          setLayers((prev) => prev.slice(-1));
        }
        for (let p = 0; p < ranges.length; p++) {
          if (p > 0) {
            const [from, to] = ranges[p]!;
            await turnPage(
              { ...base, board: sliceBoardRows(board, from, to, d.columnsPerScreen) },
              signal,
            );
          }
          await sleep(d.pageSecs * 1000, signal);
          if (signal.aborted) return;
        }
        await sleep(d.hold * 1000, signal);
      }
    }

    async function run() {
      let i = 0;
      while (!life.signal.aborted) {
        const items = latest.current.items;
        if (!items.length) {
          await sleep(1000, life.signal);
          continue;
        }
        if (i >= items.length) {
          i = 0;
          latest.current.onCycle?.();
        }
        const item = items[i]!;
        latest.current.onItem?.(item);
        // Per-item signal: aborted by the player stopping or by a skip.
        const skip = new AbortController();
        const stop = () => skip.abort();
        life.signal.addEventListener("abort", stop, { once: true });
        skipRef.current = skip;
        const signal = skip.signal;
        if (item.kind === "board") {
          await playBoard(item, signal);
        } else {
          await enter({ item, scale: 1 }, signal);
          const look = latest.current.look;
          await sleep((look.pageSecs + look.hold) * 1000, signal);
        }
        life.signal.removeEventListener("abort", stop);
        i++;
      }
    }
    void run();
    return () => life.abort();
    // The loop reads the latest props through `latest`; it starts once.
  }, []);

  const { brand, skins, sponsors } = props;
  return (
    <div className="hb-kp-stage" ref={stageRef}>
      {layers.map((s) => (
        <div
          key={s.id}
          className={`hb-kp-layer${s.paging ? " hb-kp-paging" : ""}`}
          data-kp-screen={s.id}
        >
          {s.item.kind === "board" && s.board ? (
            <div
              className="hb-kp-board"
              data-move={s.item.display.move}
              style={
                {
                  "--hb-kp-scale": s.scale,
                  "--hb-kp-cols": s.item.display.columnsPerScreen,
                } as CSSProperties
              }
            >
              <BoardRenderer board={s.board} brand={brand} kiosk cfg={s.cfg} skins={skins} />
            </div>
          ) : s.item.kind === "sponsor" ? (
            s.item.sponsor ? (
              <SponsorSlideSingle sponsor={s.item.sponsor} brand={brand} />
            ) : (
              <SponsorSlide sponsors={sponsors} brand={brand} />
            )
          ) : s.item.kind === "ad" ? (
            <AdSlide ad={s.item.ad} onError={() => skipRef.current?.abort()} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
