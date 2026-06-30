import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  teamOfDecadeBoardsTable,
  teamOfDecadeMembersTable,
} from "@workspace/db";
import {
  CreateTeamOfDecadeBoardBody,
  UpdateTeamOfDecadeBoardBody,
  UpdateTeamOfDecadeBoardParams,
  DeleteTeamOfDecadeBoardParams,
  CreateTeamOfDecadeMemberBody,
  CreateTeamOfDecadeMemberParams,
  UpdateTeamOfDecadeMemberBody,
  UpdateTeamOfDecadeMemberParams,
  DeleteTeamOfDecadeMemberParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";

const router: IRouter = Router();

type BoardRow = typeof teamOfDecadeBoardsTable.$inferSelect;
type MemberRow = typeof teamOfDecadeMembersTable.$inferSelect;

async function loadMembers(boardIds: number[]) {
  if (boardIds.length === 0) return new Map<number, MemberRow[]>();
  const rows = await db
    .select()
    .from(teamOfDecadeMembersTable)
    .where(inArray(teamOfDecadeMembersTable.boardId, boardIds))
    .orderBy(
      asc(teamOfDecadeMembersTable.battingOrder),
      asc(teamOfDecadeMembersTable.displayOrder),
      asc(teamOfDecadeMembersTable.id),
    );
  const byBoard = new Map<number, MemberRow[]>();
  for (const r of rows) {
    if (!byBoard.has(r.boardId)) byBoard.set(r.boardId, []);
    byBoard.get(r.boardId)!.push(r);
  }
  return byBoard;
}

function withMembers(boards: BoardRow[], byBoard: Map<number, MemberRow[]>) {
  return boards.map((b) => ({ ...b, members: byBoard.get(b.id) ?? [] }));
}

// Public: published boards only.
router.get("/team-of-decade-boards", async (req, res): Promise<void> => {
  const boards = await db
    .select()
    .from(teamOfDecadeBoardsTable)
    .where(and(eq(teamOfDecadeBoardsTable.tenantId, getTenantId(req)), eq(teamOfDecadeBoardsTable.published, true)))
    .orderBy(
      asc(teamOfDecadeBoardsTable.displayOrder),
      asc(teamOfDecadeBoardsTable.id),
    );
  const byBoard = await loadMembers(boards.map((b) => b.id));
  res.json(withMembers(boards, byBoard));
});

// Admin: all boards including drafts.
router.get(
  "/admin/team-of-decade-boards",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const boards = await db
      .select()
      .from(teamOfDecadeBoardsTable)
      .orderBy(
        asc(teamOfDecadeBoardsTable.displayOrder),
        asc(teamOfDecadeBoardsTable.id),
      );
    const byBoard = await loadMembers(boards.map((b) => b.id));
    res.json(withMembers(boards, byBoard));
  },
);

router.post(
  "/team-of-decade-boards",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const parsed = CreateTeamOfDecadeBoardBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .insert(teamOfDecadeBoardsTable)
      .values({
        key: parsed.data.key,
        title: parsed.data.title,
        teamLabel: parsed.data.teamLabel ?? "",
        periodLabel: parsed.data.periodLabel ?? "",
        subtitle: parsed.data.subtitle ?? "",
        published: parsed.data.published ?? false,
        displayOrder: parsed.data.displayOrder ?? 0,
      })
      .returning();
    res.status(201).json({ ...row, members: [] });
  },
);

router.patch(
  "/team-of-decade-boards/:id",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = UpdateTeamOfDecadeBoardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateTeamOfDecadeBoardBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [row] = await db
      .update(teamOfDecadeBoardsTable)
      .set(body.data)
      .where(eq(teamOfDecadeBoardsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Board not found" });
      return;
    }
    const byBoard = await loadMembers([row.id]);
    res.json({ ...row, members: byBoard.get(row.id) ?? [] });
  },
);

router.delete(
  "/team-of-decade-boards/:id",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = DeleteTeamOfDecadeBoardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(teamOfDecadeBoardsTable)
      .where(eq(teamOfDecadeBoardsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Board not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/team-of-decade-boards/:id/members",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = CreateTeamOfDecadeMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateTeamOfDecadeMemberBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [board] = await db
      .select()
      .from(teamOfDecadeBoardsTable)
      .where(eq(teamOfDecadeBoardsTable.id, params.data.id));
    if (!board) {
      res.status(404).json({ error: "Board not found" });
      return;
    }
    const [row] = await db
      .insert(teamOfDecadeMembersTable)
      .values({
        boardId: params.data.id,
        playerId: body.data.playerId ?? null,
        name: body.data.name,
        battingOrder: body.data.battingOrder ?? 0,
        role: body.data.role ?? "",
        isCaptain: body.data.isCaptain ?? false,
        isViceCaptain: body.data.isViceCaptain ?? false,
        isWicketkeeper: body.data.isWicketkeeper ?? false,
        displayOrder: body.data.displayOrder ?? 0,
      })
      .returning();
    res.status(201).json(row);
  },
);

router.patch(
  "/team-of-decade-members/:id",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = UpdateTeamOfDecadeMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateTeamOfDecadeMemberBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [row] = await db
      .update(teamOfDecadeMembersTable)
      .set(body.data)
      .where(eq(teamOfDecadeMembersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/team-of-decade-members/:id",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = DeleteTeamOfDecadeMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(teamOfDecadeMembersTable)
      .where(eq(teamOfDecadeMembersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
