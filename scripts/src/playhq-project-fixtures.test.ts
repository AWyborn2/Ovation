import { describe, expect, it } from "vitest";

import { requestDraftSweeps, type ProjectionSummary } from "./playhq-project-fixtures";

// toFixtureRow / matchOrganisation / PLAYHQ_ORG_GUID_RE moved with the projection to
// lib/db/src/playhq-ingest/project.test.ts; the HTTP sweep nudge stays with the CLI.
const HH = "4559f1b9-86d8-eb11-a7ad-2818780da0cc";

describe("requestDraftSweeps", () => {
  const summary = (tenantId: number, inserted: number, updated: number): ProjectionSummary => ({
    tenantId,
    slug: `t${tenantId}`,
    orgId: HH,
    matches: inserted + updated,
    inserted,
    updated,
  });

  it("asks for a fixtures sweep for each tenant whose fixtures changed", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const swept = await requestDraftSweeps([summary(1, 2, 0), summary(2, 0, 0), summary(3, 0, 1)], {
      url: "https://app.example/api/internal/draft-sweep",
      secret: "s3cret",
      fetchImpl,
      log: () => {},
    });
    expect(swept).toEqual([1, 3]);
    expect(calls).toHaveLength(2);
    expect(calls[0].init.headers).toMatchObject({ "x-sweep-secret": "s3cret" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ tenantId: 1, scope: "fixtures" });
  });

  it("does nothing without a URL or secret, and never throws on a failed request", async () => {
    const lines: string[] = [];
    expect(
      await requestDraftSweeps([summary(1, 1, 0)], {
        url: "",
        secret: "",
        log: (l) => lines.push(l),
      }),
    ).toEqual([]);
    expect(lines[0]).toMatch(/not requested/);

    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(
      await requestDraftSweeps([summary(1, 1, 0)], {
        url: "https://x",
        secret: "s",
        fetchImpl: failing,
        log: (l) => lines.push(l),
      }),
    ).toEqual([]);
    expect(lines.at(-1)).toMatch(/offline/);
  });
});
