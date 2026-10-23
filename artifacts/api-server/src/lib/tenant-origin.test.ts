import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomInt, randomUUID } from "node:crypto";
import { db, tenantsTable } from "@workspace/db";
import { clubLink, tenantOrigin } from "./tenant-origin";
import { purgeTestTenants } from "./tenant-purge.test-helpers";

/**
 * Links in background emails go to the club's own app: its custom domain, else
 * `<slug>.<apex>` from PLATFORM_BASE_DOMAIN / PLATFORM_HOSTS, else the caller's
 * fallback. Real-DB test (CI's api-tests job provides DATABASE_URL).
 */

const stamp = randomUUID().slice(0, 8);
let plain: number, custom: number;
const KEYS = ["PLATFORM_BASE_DOMAIN", "PLATFORM_HOSTS"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeAll(async () => {
  const rows = await db
    .insert(tenantsTable)
    .values([
      { slug: `origin-${stamp}`, name: "Origin T", centralClubId: randomInt(1e6, 1e9) },
      {
        slug: `origin-c-${stamp}`,
        name: "Origin Custom",
        centralClubId: randomInt(1e6, 1e9),
        customDomain: "Club.Example.org",
      },
    ])
    .returning();
  [plain, custom] = rows.map((r) => r.id);
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

afterAll(async () => {
  await purgeTestTenants([plain, custom]);
});

describe("tenantOrigin", () => {
  it("uses the club's subdomain of the configured apex", async () => {
    process.env.PLATFORM_BASE_DOMAIN = "ovationcc.app";
    expect(await tenantOrigin(plain)).toBe(`https://origin-${stamp}.ovationcc.app`);
  });

  it("falls back to the first platform host, without www", async () => {
    delete process.env.PLATFORM_BASE_DOMAIN;
    process.env.PLATFORM_HOSTS = "www.ovationcc.app,ovationcc.app";
    expect(await tenantOrigin(plain)).toBe(`https://origin-${stamp}.ovationcc.app`);
  });

  it("prefers a custom domain", async () => {
    process.env.PLATFORM_BASE_DOMAIN = "ovationcc.app";
    expect(await tenantOrigin(custom)).toBe("https://club.example.org");
  });

  it("is null with no apex configured or an unknown club", async () => {
    delete process.env.PLATFORM_BASE_DOMAIN;
    delete process.env.PLATFORM_HOSTS;
    expect(await tenantOrigin(plain)).toBeNull();
    process.env.PLATFORM_BASE_DOMAIN = "ovationcc.app";
    expect(await tenantOrigin(-1)).toBeNull();
  });
});

describe("clubLink", () => {
  it("makes a path absolute on the club's app, else on the fallback", async () => {
    process.env.PLATFORM_BASE_DOMAIN = "ovationcc.app";
    expect(await clubLink(plain, "/admin/selection")).toBe(
      `https://origin-${stamp}.ovationcc.app/admin/selection`,
    );
    delete process.env.PLATFORM_BASE_DOMAIN;
    expect(await clubLink(plain, "/admin/selection", "https://ovationcc.app")).toBe(
      "https://ovationcc.app/admin/selection",
    );
    expect(await clubLink(plain, "https://elsewhere.example/x")).toBe(
      "https://elsewhere.example/x",
    );
  });
});
