import { describe, expect, it } from "vitest";

import { uploadBody } from "./playhq-upload";

const dump = JSON.stringify({ version: "2.0.0", exportedAt: "t", records: [{ kind: "plan" }] });

describe("uploadBody", () => {
  it("wraps a dump as a manual ingest request", () => {
    expect(uploadBody(dump, "hh.json")).toEqual({
      collector: "manual",
      sourceName: "hh.json",
      dump: { version: "2.0.0", exportedAt: "t", records: [{ kind: "plan" }] },
    });
  });

  it("stamps a scheduled plan name when given one", () => {
    expect(uploadBody(dump, "hh.json", "matchday").planName).toBe("matchday");
  });

  it("rejects a file that is not a harness dump, and unknown plan names", () => {
    expect(() => uploadBody('{"rows":[]}', "x.json")).toThrow(/not a harness dump/);
    expect(() => uploadBody(dump, "x.json", "hourly")).toThrow(/--plan must be one of/);
  });
});
