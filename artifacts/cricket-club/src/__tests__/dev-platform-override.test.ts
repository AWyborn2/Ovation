/**
 * The dev tenant switcher's "Platform" choice (dev retest, 17 Nov 2026): on a
 * `.replit.dev` preview it sends `x-tenant-id: platform`, so the API serves
 * platform mode and testers reach the platform console. Anywhere else it is
 * never sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTenantBrand } from "@workspace/api-client-react";

/** The `x-tenant-id` the app sends from `host` with the switcher set to `stored`. */
async function sentFrom(host: string, stored: string): Promise<string | null> {
  vi.stubGlobal("location", { ...window.location, hostname: host });
  window.localStorage.setItem("ovation_dev_tenant", stored);
  const fetchMock = vi.fn(
    async () =>
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await getTenantBrand();
  const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit?])[1];
  return new Headers(init?.headers).get("x-tenant-id");
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.removeItem("ovation_dev_tenant");
});

describe("the dev switcher's Platform choice", () => {
  it("is sent from a .replit.dev preview", async () => {
    expect(await sentFrom("abc.picard.replit.dev", "platform")).toBe("platform");
  });

  it("is never sent from a published deployment or localhost", async () => {
    expect(await sentFrom("ovationcc.replit.app", "platform")).toBeNull();
    expect(await sentFrom("localhost", "platform")).toBeNull();
  });

  it("leaves a club pin as it was", async () => {
    expect(await sentFrom("abc.picard.replit.dev", "3")).toBe("3");
  });
});
