import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, figmaConnectionPendingTable } from "@workspace/db";
import { ImportFigmaClubTemplateBody, SaveFigmaTokenBody } from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { secretBoxConfigured } from "../lib/secret-box";
import { signToken } from "../lib/publishing/signed-token";
import {
  FigmaConnectionError,
  RECONNECT_REASONS,
  clubFigmaClient,
  deleteFigmaConnection,
  figmaAuthorizeUrl,
  figmaCallbackUrl,
  figmaMe,
  loadFigmaConnection,
  markNeedsReconnect,
  oauthAvailable,
  presentFigmaConnection,
  saveFigmaConnection,
} from "../lib/figma-connection/store";
import { FigmaError } from "../lib/template-import/figma";
import {
  assertTemplateKind,
  figmaErrorStatus,
  figmaImportTestDeps,
  importName,
  mapFigmaLink,
} from "../lib/template-import/figma-import";
import { createDocumentCopy, MAX_TEMPLATE_NAME, presentCopy } from "../lib/template-library/copies";
import { TemplateLibraryError } from "../lib/template-library/errors";
import { objectUrl, photoStore } from "../lib/photo-store";

/**
 * A club's own Figma connection and import (template library release 2,
 * ADR-012, R2-E).
 *
 *   GET    /figma-connection                the connection, never its token
 *   POST   /figma-connection/token          a pasted token, checked with Figma first
 *   POST   /figma-connection/oauth/start    Figma's sign-in address with signed state
 *   DELETE /figma-connection                the sealed tokens are deleted
 *   POST   /club-templates/import/figma     a Figma frame → a private club template
 *
 * Figma's callback is in `figma-callbacks.ts` (public, before tenant context).
 */
const router: IRouter = Router();

export const FIGMA_STATE_PURPOSE = "figma-oauth-state";
export const FIGMA_STATE_TTL_MS = 10 * 60 * 1000;
/** Signed OAuth state: tenant, admin, return URL, single-use nonce. */
export type FigmaOAuthState = { t: number; a: number; r: string; n: string };

const writes = [requireAdmin, requireEntitlement("socialStudio")] as const;

/** The settings page the sign-in returns to, on the host this request came in on. */
function returnUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}/admin/social/cards#figma`;
}

function requestOrigin(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function noKey(res: Response): boolean {
  if (secretBoxConfigured()) return false;
  res.status(503).json({ error: "Connecting Figma isn't set up on this server." });
  return true;
}

router.get("/figma-connection", requireAdmin, async (req, res): Promise<void> => {
  res.json(presentFigmaConnection(await loadFigmaConnection(getTenantId(req))));
});

router.post("/figma-connection/token", ...writes, async (req, res): Promise<void> => {
  const parsed = SaveFigmaTokenBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    // Never echo the body back: it holds the token.
    res.status(400).json({ error: "Paste a Figma personal access token." });
    return;
  }
  if (noKey(res)) return;
  const tenantId = getTenantId(req);
  const admin = (req as RequestWithAdmin).admin!;
  const token = parsed.data.token.trim();
  try {
    const user = await figmaMe(token, "personal");
    if (!user) {
      res.status(400).json({
        error:
          "Figma refused that token. Make a new personal access token with the scopes " +
          "File content: read and Current user: read, and paste it again.",
      });
      return;
    }
    const row = await saveFigmaConnection(
      tenantId,
      admin.id,
      "token",
      { accessToken: token, refreshToken: null, expiresAt: null },
      user,
    );
    res.json(presentFigmaConnection(row));
  } catch (err) {
    sendConnectionError(res, err);
  }
});

router.post("/figma-connection/oauth/start", ...writes, async (req, res): Promise<void> => {
  if (!oauthAvailable()) {
    res.status(503).json({ error: "Sign in with Figma isn't set up. Paste a token instead." });
    return;
  }
  if (noKey(res)) return;
  const tenantId = getTenantId(req);
  const admin = (req as RequestWithAdmin).admin!;
  const nonce = randomBytes(16).toString("hex");
  // One sign-in in progress per admin: an older one stops working.
  await db
    .delete(figmaConnectionPendingTable)
    .where(
      and(
        eq(figmaConnectionPendingTable.tenantId, tenantId),
        eq(figmaConnectionPendingTable.adminId, admin.id),
      ),
    );
  await db.insert(figmaConnectionPendingTable).values({
    tenantId,
    adminId: admin.id,
    nonce,
    expiresAt: new Date(Date.now() + FIGMA_STATE_TTL_MS),
  });
  const state = signToken(
    FIGMA_STATE_PURPOSE,
    { t: tenantId, a: admin.id, r: returnUrl(req), n: nonce } satisfies FigmaOAuthState,
    FIGMA_STATE_TTL_MS,
  );
  res.json({ url: figmaAuthorizeUrl(state, nonce, figmaCallbackUrl(requestOrigin(req))) });
});

router.delete("/figma-connection", requireAdmin, async (req, res): Promise<void> => {
  await deleteFigmaConnection(getTenantId(req));
  res.status(204).end();
});

/** A connection failure as a plain message; nothing from Figma's body, never the token. */
function sendConnectionError(res: Response, err: unknown): void {
  if (err instanceof FigmaConnectionError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  throw err;
}

/** Club-facing wording for Figma failures (the platform's mention Ovation's own token). */
function clubFigmaMessage(err: FigmaError): string {
  switch (err.code) {
    case "token":
      return RECONNECT_REASONS.refused;
    case "forbidden":
      return "Figma won't open this file for the connected account. Share the file with that account, or check the link.";
    case "rate-limited":
      return `Figma is rate limiting this account. Try again${
        err.retryAfterSeconds ? ` in ${err.retryAfterSeconds} s` : " shortly"
      }.`;
    default:
      return err.message;
  }
}

/** Club Figma images live in the club's own storage, never the shared library prefix. */
function clubAssetSaver(tenantId: number) {
  return async (bytes: Buffer, type: "image/png"): Promise<string> =>
    objectUrl(await photoStore().write(bytes, type, `figma/t${tenantId}`));
}

router.post("/club-templates/import/figma", ...writes, async (req, res): Promise<void> => {
  const parsed = ImportFigmaClubTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const adminId = (req as RequestWithAdmin).admin?.id ?? null;
  const body = parsed.data;
  try {
    assertTemplateKind(body.kind);
    const client = await clubFigmaClient(tenantId);
    const test = figmaImportTestDeps();
    const mapped = await mapFigmaLink(body, {
      client,
      saveAsset: clubAssetSaver(tenantId),
      download: test?.download,
      fonts: test?.fonts,
    });
    let row;
    try {
      row = await createDocumentCopy(
        tenantId,
        {
          kind: body.kind,
          name: importName(body.name, mapped.fileName, MAX_TEMPLATE_NAME),
          document: mapped.document,
        },
        adminId,
      );
    } catch (err) {
      // A document the format refuses: say why, with the report that explains the mapping.
      if (err instanceof TemplateLibraryError && err.status === 400) {
        throw new TemplateLibraryError(400, { ...err.body, report: mapped.report });
      }
      throw err;
    }
    res.status(201).json({
      template: await presentCopy(row),
      fileName: mapped.fileName,
      frames: mapped.frames,
      report: mapped.report,
      fonts: mapped.fonts,
    });
  } catch (err) {
    if (err instanceof FigmaError) {
      // A pasted token has no known expiry: a refusal is how we learn it ended.
      if (err.code === "token") await markNeedsReconnect(tenantId, RECONNECT_REASONS.refused);
      res.status(figmaErrorStatus(err)).json({ error: clubFigmaMessage(err) });
      return;
    }
    if (err instanceof TemplateLibraryError) {
      res.status(err.status).json(err.body);
      return;
    }
    sendConnectionError(res, err);
  }
});

export default router;
