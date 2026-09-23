import { useMemo } from "react";
import { Link } from "wouter";
import { useGetHonourDisplay } from "@workspace/api-client-react";
import { BoardRenderer } from "@/components/honours-display/board-renderer";
import { rootStyle } from "@/components/honours-display/theme";
import { skinClass } from "@/components/honours-display/types";
import {
  useApproachingBoard,
  applyBoardConfig,
} from "@/components/honours-display/use-approaching-board";
import { QueryError } from "@/components/data-states";
import { Button } from "@/components/ui/button";
import { PageHeader, PageStack } from "@/components/broadcast";
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
        <div className="animate-pulse text-muted-foreground">Loading honour boards…</div>
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
    <PageStack>
      <PageHeader
        eyebrow="Clubroom display"
        title="Digital Honour Boards"
        subtitle={`${brand.name} — premierships, records and honours, styled for the big screen.`}
        actions={
          <Button asChild>
            <Link href="/honours-display/kiosk">▶ Launch kiosk</Link>
          </Button>
        }
      />

      <div className={`hb ${skinClass(skin)} space-y-10`} style={rootStyle(brand, settings)}>
        {boards.map((board) => (
          <BoardRenderer
            key={board.id}
            board={board}
            brand={brand}
            cfg={settings.boardConfigs?.[board.id]}
            skins={settings.skins}
          />
        ))}
      </div>
    </PageStack>
  );
}
