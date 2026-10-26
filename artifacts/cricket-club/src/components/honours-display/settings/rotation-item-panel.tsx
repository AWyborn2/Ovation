import { RotateCcw } from "lucide-react";
import type { BoardDisplayConfig, DisplayBoard } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import type { HonoursDisplayForm } from "../use-honours-display-settings";
import { BOARD_LAYOUT_LABEL, rotationItemKind } from "./rotation-list";
import { MOTION_KEYS, TvMotionFields, motionDefaults } from "./tv-motion-fields";

const COLUMNS_LABEL: Record<DisplayBoard["layout"], string> = {
  grid: "Grade columns per screen",
  columns: "Columns per screen",
  list: "Columns",
  lifeMembers: "Columns",
  premiership: "Plaques across",
  teamOfDecade: "Columns",
  leaderboard: "Columns",
};

/**
 * Settings for the rotation item selected in the builder (honours kiosk
 * redesign B3). A board gets the TV controls its layout uses, each defaulting
 * to the club look; sponsor walls and ads point to where they are set up.
 */
export function RotationItemPanel({
  form,
  token,
}: {
  form: HonoursDisplayForm;
  token: string | null;
}) {
  if (!token) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          Select a board in the rotation to set how it plays on the TV.
        </p>
      </Panel>
    );
  }
  const kind = rotationItemKind(token);
  if (kind !== "board") {
    return (
      <Panel title={form.seqLabel(token)}>
        <p className="text-sm text-muted-foreground">
          {kind === "sponsor"
            ? "The sponsor wall shows the sponsors chosen on the Sponsors & ads tab."
            : "Upload or replace this advert on the Sponsors & ads tab."}
        </p>
      </Panel>
    );
  }
  const board = form.boardById.get(token);
  if (!board) {
    return (
      <Panel title={form.seqLabel(token)}>
        <p className="text-sm text-muted-foreground">
          This board no longer exists. Remove it from the rotation.
        </p>
      </Panel>
    );
  }
  return <BoardTvSettings form={form} board={board} />;
}

function BoardTvSettings({ form, board }: { form: HonoursDisplayForm; board: DisplayBoard }) {
  const cfg = form.boardConfigs[board.id] ?? {};
  const resolve = (value: typeof cfg) => form.resolveBoard(board, value);
  const maxColumns = resolve({ columnsPerScreen: 5 }).columnsPerScreen;
  const leaderboard = board.layout === "leaderboard";
  const overridden =
    MOTION_KEYS.some((k) => cfg[k] !== undefined) || (leaderboard && cfg.top !== undefined);
  const repeats = form.sequence.filter((t) => t === board.id).length;

  return (
    <Panel title={board.title} sub={`TV settings · ${BOARD_LAYOUT_LABEL[board.layout]}`}>
      {leaderboard && (
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Show top</span>
          <select
            className="w-full rounded border bg-card px-2 py-1.5 text-sm"
            value={cfg.top ?? ""}
            onChange={(e) =>
              form.setConfig(board.id, {
                top: e.target.value
                  ? (Number(e.target.value) as BoardDisplayConfig["top"])
                  : undefined,
              })
            }
            data-testid={`board-tv-${board.id}-top`}
          >
            <option value="">Default · 20</option>
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      <TvMotionFields
        value={cfg}
        defaults={motionDefaults(cfg, resolve)}
        onPatch={(patch) => form.setConfig(board.id, patch)}
        maxColumns={maxColumns}
        columnsLabel={COLUMNS_LABEL[board.layout]}
        idPrefix={`board-tv-${board.id}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-[11px] text-muted-foreground">
          Default follows the Look tab.
          {repeats > 1 ? " These settings apply each time this board plays." : ""}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!overridden}
          onClick={() => form.resetBoardMotion(board.id)}
          data-testid={`board-tv-reset-${board.id}`}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Use club defaults
        </Button>
      </div>
    </Panel>
  );
}

function Panel({
  title,
  sub,
  children,
}: {
  title?: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-3 rounded border bg-muted/20 p-4"
      aria-label={title ? `${title} settings` : "Rotation item settings"}
      data-testid="rotation-item-panel"
    >
      {title && (
        <header>
          <h4 className="text-sm font-semibold">{title}</h4>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
