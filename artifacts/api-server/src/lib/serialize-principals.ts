import type { AdminRow, CaptainRow } from "@workspace/db";

/**
 * Public DTO shapes for the two kinds of club login. Each is served from two
 * routes (the auth flow that signs the principal in, and the admin CRUD that
 * manages them), so a single serializer keeps the shapes in lock-step and
 * guarantees the password hash never rides along.
 */

export function serializeAdmin(
  a: Pick<AdminRow, "id" | "username" | "displayName" | "createdAt">,
) {
  return {
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    createdAt: a.createdAt.toISOString(),
  };
}

export function serializeCaptain(
  c: Pick<CaptainRow, "id" | "username" | "displayName" | "createdAt">,
  grades: string[],
) {
  return {
    id: c.id,
    username: c.username,
    displayName: c.displayName,
    grades,
    createdAt: c.createdAt.toISOString(),
  };
}
