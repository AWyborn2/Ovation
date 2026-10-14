import { describe, expect, it } from "vitest";
import { eachJuniorDraft } from "./junior-social";

/**
 * The junior sweep's per-draft isolation (junior PlayHQ sync review, reliability P2):
 * one failing draft never stops the rest, and the log carries ids and a safe error
 * text only — never card JSON or a child's name.
 */
describe("eachJuniorDraft", () => {
  it("keeps going after a draft throws and logs only tenant, draft and a safe error", async () => {
    const seen: number[] = [];
    const logged: unknown[] = [];
    const log = {
      error: (obj: unknown) => logged.push(obj),
      warn: () => {},
      info: () => {},
    };
    const failures = await eachJuniorDraft(
      [
        { id: 1, tenantId: 7 },
        { id: 2, tenantId: 7 },
        { id: 3, tenantId: 7 },
      ],
      async (d) => {
        if (d.id === 2) {
          throw Object.assign(
            new Error(
              'Failed query: update social_drafts\nparams: {"players":[{"surname":"GALLASH"}]}',
            ),
            { code: "23514" },
          );
        }
        seen.push(d.id);
      },
      log,
    );
    expect(failures).toBe(1);
    expect(seen).toEqual([1, 3]);
    expect(logged).toEqual([
      { tenantId: 7, draftId: 2, error: "23514: Failed query: update social_drafts" },
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/gallash/i);
  });

  it("does not need a logger", async () => {
    await expect(
      eachJuniorDraft([{ id: 1, tenantId: 1 }], async () => {
        throw new Error("boom");
      }),
    ).resolves.toBe(1);
  });
});
