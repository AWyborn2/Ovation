import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useGetHonourDisplay } from "@workspace/api-client-react";
import { BoardRenderer } from "@/components/honours-display/BoardRenderer";
import { brandStyle } from "@/components/honours-display/theme";
import type { DisplayBoard, TemplateId } from "@/components/honours-display/types";
import "@/styles/honour-boards.css";

/** Stagger the row-reveal animation across a freshly shown board (ported). */
function stagger(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>("tr, .flag, .row, .stat, .pc")
    .forEach((el, i) => {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "hb-rowin .6s ease both " + Math.min(i * 70, 2200) + "ms";
    });
}

export default function HonoursKiosk() {
  const { data, refetch } = useGetHonourDisplay();
  const [, navigate] = useLocation();
  const [index, setIndex] = useState(0);

  const boards = data?.boards ?? [];
  const settings = data?.settings;
  const brand = data?.brand;

  // Default kiosk timings (overridden by settings when present).
  const DWELL = settings?.kioskDwellMs ?? 3500;
  const ENDHOLD = settings?.kioskEndHoldMs ?? 3000;
  const SPEED = settings?.kioskScrollSpeed ?? 36;

  // Resolve the kiosk sequence into the ordered list of (board, template) to show.
  const sequence = useMemo(() => {
    if (!boards.length || !settings) return [] as { board: DisplayBoard; template: TemplateId }[];
    const byId = new Map(boards.map((b) => [b.id, b]));
    const tmplFor = (b: DisplayBoard): TemplateId =>
      (settings.boardOverrides?.[b.id] as TemplateId) ||
      (settings.defaultTemplate as TemplateId);

    const seq = (settings.kioskSequence ?? [])
      .map((entry) => {
        // Sequence items are board ids; allow "boardId:template" override too.
        const [id, tmpl] = entry.split(":");
        const board = byId.get(id!);
        if (!board) return null;
        return { board, template: (tmpl as TemplateId) || tmplFor(board) };
      })
      .filter((x): x is { board: DisplayBoard; template: TemplateId } => x !== null);

    if (seq.length) return seq;
    // Fallback: every board in its resolved template.
    return boards.map((b) => ({ board: b, template: tmplFor(b) }));
  }, [boards, settings]);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleRef = useRef(0);

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate("/honours-display");
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

  // Drive the rotation: dwell, credit-scroll, end-hold, then advance + refetch.
  useEffect(() => {
    if (!sequence.length) return;
    cycleRef.current += 1;
    const myCycle = cycleRef.current;
    const alive = () => cycleRef.current === myCycle;

    const fr = frameRef.current?.querySelector<HTMLElement>(".frame");
    if (frameRef.current) stagger(frameRef.current);
    if (fr) fr.scrollTop = 0;

    timerRef.current = setTimeout(() => {
      if (!alive() || !fr) return;
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
      } else {
        timerRef.current = setTimeout(advance, ENDHOLD);
      }
    }, DWELL);

    function advance() {
      if (!alive()) return;
      // Refetch each full loop so the TV picks up new results without a reload.
      if (index + 1 >= sequence.length) refetch();
      setIndex((i) => (i + 1) % sequence.length);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sequence, DWELL, ENDHOLD, SPEED]);

  if (!data || !settings || !brand || !sequence.length) {
    return (
      <div className="hb-kiosk flex items-center justify-center text-white">
        <div className="text-sm opacity-70">Preparing honour boards…</div>
      </div>
    );
  }

  const current = sequence[index % sequence.length]!;

  return (
    <div className="hb-kiosk">
      <div className="hb" style={brandStyle(brand)}>
        <div className="preset active" ref={frameRef}>
          <BoardRenderer
            board={current.board}
            template={current.template}
            brand={brand}
            kiosk
          />
        </div>
      </div>
      <button className="hb-kexit" onClick={exit}>
        ✕ Exit kiosk (Esc)
      </button>
    </div>
  );
}
