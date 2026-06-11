import { useMemo } from "react";
import { Link } from "wouter";
import { useGetHonourDisplay } from "@workspace/api-client-react";
import { BoardRenderer } from "@/components/honours-display/BoardRenderer";
import { rootStyle } from "@/components/honours-display/theme";
import { skinClass } from "@/components/honours-display/types";
import {
  useApproachingBoard,
  applyBoardConfig,
} from "@/components/honours-display/useApproachingBoard";
import { QueryError } from "@/components/data-states";
import "@/styles/honour-boards.css";

export default function HonoursDisplay() {
  const { data, isLoading, isError, refetch } = useGetHonourDisplay();
  const approachingBoard = useApproachingBoard();

  const boards = useMemo(() => {
    const base = data?.boards ?? [];
    if (!approachingBoard) return base;
    return [...base, applyBoardConfig(approachingBoard, data?.settings?.boardConfigs)];
  }, [data?.boards, data?.settings, approachingBoard]);

  const settings = data?.settings;
  const brand = data?.brand;

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

  const skin = settings.defaultTemplate;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Digital Honour Boards</h1>
          <p className="text-sm text-slate-500 mt-1">
            {brand.name} — premierships, records and honours, styled for the big screen.
          </p>
        </div>
        <Link
          href="/honours-display/kiosk"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          ▶ Launch kiosk
        </Link>
      </div>

      <div
        className={`hb ${skinClass(skin)} space-y-10`}
        style={rootStyle(brand, settings)}
      >
        {boards.map((board) => (
          <BoardRenderer
            key={board.id}
            board={board}
            brand={brand}
            cfg={settings.boardConfigs?.[board.id]}
          />
        ))}
      </div>
    </div>
  );
}
