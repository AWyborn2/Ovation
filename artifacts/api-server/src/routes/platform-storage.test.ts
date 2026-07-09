import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

// The Replit object-storage sidecar isn't reachable in tests, so stub the
// service the route delegates to. This proves the route's own logic (auth +
// validation + delegation + response shape) without needing the sidecar —
// the same seam storage.ts's route would need if it had tests.
const { getObjectEntityUploadURL } = vi.hoisted(() => ({
  getObjectEntityUploadURL: vi.fn(
    async () =>
      "https://storage.googleapis.com/test-bucket/.private/uploads/00000000-0000-0000-0000-000000000000?signed=1",
  ),
}));
// Must stay a real class: other modules loaded via app (e.g.
// sponsor-logo-migration.ts) call `new ObjectStorageService()` at module scope.
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {
    getObjectEntityUploadURL = getObjectEntityUploadURL;
    normalizeObjectEntityPath = (rawPath: string): string =>
      rawPath.startsWith("https://storage.googleapis.com/")
        ? "/objects/uploads/00000000-0000-0000-0000-000000000000"
        : rawPath;
  },
}));

import app from "../app";
import { db, platformAdminsTable, tenantsTable, adminsTable } from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Platform-scoped presigned-upload route (Phase 2e follow-on, R4 upload half).
 * A platform admin can request a presigned upload URL for tenant branding
 * assets (logo/favicon); a club-admin session and unauthenticated requests
 * must never reach it. Mirrors storage.ts's self-serve route's validation.
 *
 * Real-DB integration test: needs DATABASE_URL for the admin/session setup.
 * The object-storage sidecar call itself is mocked (see above).
 */

const STAMP = Date.now();
const EMAIL = `super-storage+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("platform storage upload route", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let tenantId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-platform-storage";

    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Super", passwordHash });
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];

    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `pa-storage-${STAMP}`,
        centralClubId: 9202,
        name: "PA Storage Throwaway",
        plan: "free",
      })
      .returning();
    tenantId = t.id;

    const [ca] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: "owner",
        displayName: "Club",
        passwordHash,
      })
      .returning();
    clubAdminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
  });

  it("returns a presigned upload URL for a platform admin", async () => {
    const res = await request(app)
      .post("/api/platform/admin/storage/uploads/request-url")
      .set("Cookie", platformCookie)
      .send({ name: "logo.png", size: 1024, contentType: "image/png" })
      .expect(200);

    expect(res.body.uploadURL).toContain("https://storage.googleapis.com/");
    expect(res.body.objectPath).toBe(
      "/objects/uploads/00000000-0000-0000-0000-000000000000",
    );
    expect(res.body.metadata).toEqual({
      name: "logo.png",
      size: 1024,
      contentType: "image/png",
    });
    expect(getObjectEntityUploadURL).toHaveBeenCalled();
  });

  it("rejects an unauthenticated request (401)", async () => {
    await request(app)
      .post("/api/platform/admin/storage/uploads/request-url")
      .send({ name: "logo.png", size: 1024, contentType: "image/png" })
      .expect(401);
  });

  it("rejects a club-admin session (401, not the platform surface)", async () => {
    await request(app)
      .post("/api/platform/admin/storage/uploads/request-url")
      .set("Cookie", clubAdminCookie)
      .send({ name: "logo.png", size: 1024, contentType: "image/png" })
      .expect(401);
  });

  it("rejects a body missing required fields (400)", async () => {
    const res = await request(app)
      .post("/api/platform/admin/storage/uploads/request-url")
      .set("Cookie", platformCookie)
      .send({ name: "logo.png" })
      .expect(400);
    expect(res.body.error).toMatch(/Missing or invalid required fields/);
  });

  it("rejects an unsupported content type (400)", async () => {
    const res = await request(app)
      .post("/api/platform/admin/storage/uploads/request-url")
      .set("Cookie", platformCookie)
      .send({ name: "malware.exe", size: 1024, contentType: "application/x-msdownload" })
      .expect(400);
    expect(res.body.error).toMatch(/Unsupported file type/);
  });

  it("rejects an oversized image (400)", async () => {
    const res = await request(app)
      .post("/api/platform/admin/storage/uploads/request-url")
      .set("Cookie", platformCookie)
      .send({
        name: "huge.png",
        size: 11 * 1024 * 1024,
        contentType: "image/png",
      })
      .expect(400);
    expect(res.body.error).toMatch(/File too large/);
  });
});
