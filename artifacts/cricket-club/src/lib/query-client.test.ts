import { describe, it, expect } from "vitest";
import { createAppQueryClient } from "./query-client";

describe("createAppQueryClient", () => {
  it("applies the app-wide read-mostly defaults (60s staleTime, no focus refetch)", () => {
    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(60_000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
  });

  it("lets per-query options override the defaults (auth/polling screens rely on this)", () => {
    const client = createAppQueryClient();
    const resolved = client.defaultQueryOptions({
      queryKey: ["me"],
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    });
    expect(resolved.staleTime).toBe(30_000);
    expect(resolved.refetchOnWindowFocus).toBe(true);
  });
});
