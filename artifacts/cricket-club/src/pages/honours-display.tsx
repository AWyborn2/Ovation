import { useMemo } from "react";
import { Link } from "wouter";
import { useGetHonourDisplay } from "@workspace/api-client-react";
import { BoardRenderer } from "@/components/honours-display/BoardRenderer";
import { brandStyle } from "@/components/honours-display/theme";
import { skinClass } from "@/components/honours-display/types";
import type { TemplateId } from "@/components/honours-display/types";
import { useApproachingBoard } from "@/components/honours-display/useApproachingBoard";
import { QueryError } from "@/components/data-states";
import "@/styles/honour-boards.css";

export default function HonoursDisplay() {
  const { data, isLoading, isError, refetch } = useGetHonourDisplay();
  const approachingBoard = useApproachingBoard();

  const boards = useMemo(() => {
    const base = data?.boards ?? [];
    return approachingBoard ? [...base, approachingBoard] : base;
  }, [data?.boards, approachingBoard]);

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

  const skin = settings.defaultTemplate as TemplateId;

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

      <div className={`hb ${skinClass(skin)} space-y-10`} style={brandStyle(brand)}>
        {boards.map((board) => (
          <BoardRenderer key={board.id} board={board} brand={brand} />
        ))}
      </div>
    </div>
  );
}
