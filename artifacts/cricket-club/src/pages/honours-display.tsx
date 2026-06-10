import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetHonourDisplay } from "@workspace/api-client-react";
import { BoardRenderer } from "@/components/honours-display/BoardRenderer";
import { brandStyle } from "@/components/honours-display/theme";
import { TEMPLATES } from "@/components/honours-display/types";
import type { TemplateId, DisplayBoard, HonourDisplaySettings } from "@/components/honours-display/types";
import { QueryError } from "@/components/data-states";
import "@/styles/honour-boards.css";

function templateFor(
  board: DisplayBoard,
  settings: HonourDisplaySettings,
  viewerChoice: TemplateId | null,
): TemplateId {
  if (viewerChoice) return viewerChoice;
  const override = settings.boardOverrides?.[board.id];
  if (override) return override as TemplateId;
  return settings.defaultTemplate as TemplateId;
}

export default function HonoursDisplay() {
  const { data, isLoading, isError, refetch } = useGetHonourDisplay();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewerChoice, setViewerChoice] = useState<TemplateId | null>(null);

  const boards = data?.boards ?? [];
  const settings = data?.settings;
  const brand = data?.brand;

  const activeBoard = useMemo(() => {
    if (!boards.length) return null;
    return boards.find((b) => b.id === activeId) ?? boards[0]!;
  }, [boards, activeId]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="animate-pulse text-slate-400">Loading honour boards…</div>
      </div>
    );
  }

  if (isError || !data || !settings || !brand) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <QueryError onRetry={() => refetch()} />
      </div>
    );
  }

  const showTabs = settings.showTabs;
  const allowSwitch = settings.allowViewerTemplateSwitch;
  const visibleBoards = showTabs && activeBoard ? [activeBoard] : boards;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Digital Honour Boards</h1>
          <p className="text-sm text-slate-500 mt-1">
            {brand.name} — premierships, records and honours, styled for the big screen.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {allowSwitch ? (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="hidden sm:inline">Skin</span>
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                value={viewerChoice ?? "__default"}
                onChange={(e) =>
                  setViewerChoice(
                    e.target.value === "__default" ? null : (e.target.value as TemplateId),
                  )
                }
              >
                <option value="__default">Default</option>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Link
            href="/honours-display/kiosk"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            ▶ Launch kiosk
          </Link>
        </div>
      </div>

      {showTabs ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => setActiveId(b.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                (activeBoard?.id === b.id)
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {b.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="hb space-y-10" style={brandStyle(brand)}>
        {visibleBoards.map((board) => (
          <BoardRenderer
            key={board.id}
            board={board}
            template={templateFor(board, settings, viewerChoice)}
            brand={brand}
          />
        ))}
      </div>
    </div>
  );
}
