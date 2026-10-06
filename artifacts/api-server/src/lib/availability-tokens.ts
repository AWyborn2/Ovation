import type { Request } from "express";
import { and, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import {
  db,
  tenantsTable,
  availabilityRequestsTable,
  availabilityTokensTable,
  availabilityRoundsTable,
  squadMembersTable,
  type AvailabilityRequestRow,
  type AvailabilityRoundRow,
  type AvailabilityTokenRow,
  type RecipientSlot,
  type SquadMemberRow,
  type TenantRow,
} from "@workspace/db";
import { generateResetToken, hashResetToken } from "./auth";
import { tenantUrl } from "./tenant-url";
import { addDays, perthDayStart } from "./availability-grades";

/**
 * Personal-link tokens for the availability round.
 *
 * Only the SHA-256 hash is stored, so every outbound message mints a fresh
 * token for its recipient; a request may hold several live tokens, all valid
 * until the round's expiry. A token resolves to exactly one request — one
 * member's recipient slot in one round — so a forwarded link exposes nothing
 * else. Raw tokens are never logged.
 */

/** The player page path for a raw token (the web route is `/availability/:token`). */
export function availabilityPath(token: string): string {
  return `/availability/${encodeURIComponent(token)}`;
}

/**
 * Absolute link to the player page on the club's own host. Messages sent from
 * the scheduled sweep have no request, so the host then comes from
 * `PLATFORM_BASE_DOMAIN` / `PLATFORM_HOSTS` (or the club's custom domain).
 */
export function availabilityLink(
  tenant: Pick<TenantRow, "slug" | "customDomain">,
  token: string,
  req?: Request,
): string {
  const r = req ?? ({ headers: {} } as unknown as Request);
  return tenantUrl(r, tenant, availabilityPath(token));
}

/**
 * Default expiry for a round's tokens: the end of the day after the weekend's
 * Sunday, Perth time (Tuesday 00:00 +08:00) — "valid until the day after the
 * round's last fixture". `weekendDate` is the round's Saturday (YYYY-MM-DD).
 */
export function defaultTokenExpiry(weekendDate: string): Date {
  return perthDayStart(addDays(weekendDate, 3));
}

/** Mint a token for a request row; returns the raw token (shown once) and its row id. */
export async function mintRequestToken(args: {
  tenantId: number;
  requestId: number;
  expiresAt: Date;
}): Promise<{ token: string; tokenId: number }> {
  const { token, tokenHash } = generateResetToken();
  const [row] = await db
    .insert(availabilityTokensTable)
    .values({
      tenantId: args.tenantId,
      requestId: args.requestId,
      tokenHash,
      expiresAt: args.expiresAt,
    })
    .returning({ id: availabilityTokensTable.id });
  return { token, tokenId: row.id };
}

export type ResolvedAvailabilityToken = {
  token: AvailabilityTokenRow;
  request: AvailabilityRequestRow;
  member: SquadMemberRow;
  round: AvailabilityRoundRow;
};

/**
 * Look a raw token up for one tenant. Null when it is unknown, belongs to
 * another tenant, has expired or was revoked, or its member is no longer
 * active — callers answer 404 without saying which.
 */
export async function resolveAvailabilityToken(
  tenantId: number,
  rawToken: string,
  now: Date = new Date(),
): Promise<ResolvedAvailabilityToken | null> {
  if (!rawToken) return null;
  const [row] = await db
    .select({
      token: availabilityTokensTable,
      request: availabilityRequestsTable,
      member: squadMembersTable,
      round: availabilityRoundsTable,
    })
    .from(availabilityTokensTable)
    .innerJoin(
      availabilityRequestsTable,
      eq(availabilityRequestsTable.id, availabilityTokensTable.requestId),
    )
    .innerJoin(squadMembersTable, eq(squadMembersTable.id, availabilityRequestsTable.memberId))
    .innerJoin(
      availabilityRoundsTable,
      eq(availabilityRoundsTable.id, availabilityRequestsTable.roundId),
    )
    .where(
      and(
        eq(availabilityTokensTable.tokenHash, hashResetToken(rawToken)),
        eq(availabilityTokensTable.tenantId, tenantId),
        eq(availabilityRequestsTable.tenantId, tenantId),
        eq(squadMembersTable.tenantId, tenantId),
        eq(squadMembersTable.active, true),
        isNull(availabilityTokensTable.revokedAt),
        gt(availabilityTokensTable.expiresAt, now),
      ),
    );
  return row ?? null;
}

/**
 * Revoke a request's live tokens except `keepTokenId` (the one in use) — run
 * after a contact change so links sent to the old contact stop working.
 * Returns how many were revoked.
 */
export async function revokeOtherTokens(args: {
  tenantId: number;
  requestId: number;
  keepTokenId?: number;
  now?: Date;
}): Promise<number> {
  const conds = [
    eq(availabilityTokensTable.tenantId, args.tenantId),
    eq(availabilityTokensTable.requestId, args.requestId),
    isNull(availabilityTokensTable.revokedAt),
  ];
  if (args.keepTokenId != null) conds.push(ne(availabilityTokensTable.id, args.keepTokenId));
  const rows = await db
    .update(availabilityTokensTable)
    .set({ revokedAt: args.now ?? new Date() })
    .where(and(...conds))
    .returning({ id: availabilityTokensTable.id });
  return rows.length;
}

/**
 * Revoke every live token of a member — all recipient slots, or only `slots`
 * — in every round: run when an admin removes the member or changes a slot's
 * contact, so links already sent stop working. Returns how many were revoked.
 */
export async function revokeMemberTokens(args: {
  tenantId: number;
  memberId: number;
  slots?: readonly RecipientSlot[];
  now?: Date;
}): Promise<number> {
  if (args.slots && args.slots.length === 0) return 0;
  const requests = db
    .select({ id: availabilityRequestsTable.id })
    .from(availabilityRequestsTable)
    .where(
      and(
        eq(availabilityRequestsTable.tenantId, args.tenantId),
        eq(availabilityRequestsTable.memberId, args.memberId),
        ...(args.slots ? [inArray(availabilityRequestsTable.recipientSlot, [...args.slots])] : []),
      ),
    );
  const rows = await db
    .update(availabilityTokensTable)
    .set({ revokedAt: args.now ?? new Date() })
    .where(
      and(
        eq(availabilityTokensTable.tenantId, args.tenantId),
        inArray(availabilityTokensTable.requestId, requests),
        isNull(availabilityTokensTable.revokedAt),
      ),
    )
    .returning({ id: availabilityTokensTable.id });
  return rows.length;
}

/** The tenant columns a link needs, read once per message batch. */
export async function loadTenantForLinks(
  tenantId: number,
): Promise<Pick<TenantRow, "slug" | "customDomain"> | null> {
  const [row] = await db
    .select({ slug: tenantsTable.slug, customDomain: tenantsTable.customDomain })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  return row ?? null;
}
