/**
 * The server fit job (ADR-011 §4, L2-B, T2.6–T2.7): results land on the
 * version, a check that can't run is tried again and then left pending for the next sweep, and
 * fit checks wait behind card renders. Real-DB test (needs DATABASE_URL); the
 * browser check is stubbed (CI has no Chromium here).
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateLooksTable,
} from "@workspace/db";
import type { TemplateFitReport } from "@workspace/scorecard/kind-templates";
import { serialisedFitCheck, serialisedRender } from "../draft-render";
import { syncBundles } from "./bundles";
import { fixtureBundle, fixtureTemplate } from "./bundles.test-helpers";
import { registerFitRunner } from "./fit";
import { fitChecksSettled, fitRunner, retryPendingFits, setFitCheck, startFitJob } from "./fit-job";

const STAMP = Date.now();
const LOOK = `t-fit-${STAMP}`;

const report = (status: "pass" | "fail"): TemplateFitReport => ({
  kind: "player",
  status,
  variants: 8,
  issues:
    status === "pass"
      ? []
      : [
          {
            variant: "card.square.photo",
            page: "card",
            size: "square",
            reason: "overflow",
            layerId: "name",
          },
        ],
  renderer: "test",
  fonts: "test",
  checkedAt: "2026-10-22T00:00:00.000Z",
});

const quiet = { info: () => {}, warn: () => {}, error: () => {} };

async function version(slug: string) {
  const [t] = await db
    .select({ id: libraryTemplatesTable.id })
    .from(libraryTemplatesTable)
    .where(eq(libraryTemplatesTable.slug, slug));
  const [v] = await db
    .select()
    .from(libraryTemplateVersionsTable)
    .where(eq(libraryTemplateVersionsTable.templateId, t!.id));
  return v!;
}

afterEach(() => {
  registerFitRunner(null);
  setFitCheck(null);
});

afterAll(async () => {
  const templates = await db
    .select({ id: libraryTemplatesTable.id })
    .from(libraryTemplatesTable)
    .where(like(libraryTemplatesTable.slug, `${LOOK}%`));
  if (templates.length > 0)
    await db.delete(libraryTemplatesTable).where(
      inArray(
        libraryTemplatesTable.id,
        templates.map((t) => t.id),
      ),
    );
  await db.delete(templateLooksTable).where(like(templateLooksTable.slug, `${LOOK}%`));
});

describe("the fit job", () => {
  it("checks a new bundle version and writes its result", async () => {
    const checked: string[] = [];
    setFitCheck(async (_doc, kind) => {
      checked.push(kind);
      return report("pass");
    });
    registerFitRunner(fitRunner(quiet));
    await syncBundles([fixtureBundle(`${LOOK}-a`, [fixtureTemplate("player")])]);
    expect((await version(`${LOOK}-a/player`)).fitStatus).toBe("pending");
    await fitChecksSettled();
    const v = await version(`${LOOK}-a/player`);
    expect(checked).toEqual(["player"]);
    expect(v.fitStatus).toBe("pass");
    expect(v.fitReport).toMatchObject({ status: "pass", variants: 8 });
  });

  it("records a failing check with its issues", async () => {
    setFitCheck(async () => report("fail"));
    registerFitRunner(fitRunner(quiet));
    await syncBundles([fixtureBundle(`${LOOK}-b`, [fixtureTemplate("player")])]);
    await fitChecksSettled();
    const v = await version(`${LOOK}-b/player`);
    expect(v.fitStatus).toBe("fail");
    expect((v.fitReport as TemplateFitReport).issues[0]).toMatchObject({ reason: "overflow" });
  });

  it("tries a check that couldn't run again, so a harness still starting doesn't leave it pending", async () => {
    let calls = 0;
    setFitCheck(async () => {
      calls += 1;
      if (calls < 3) throw new Error("net::ERR_CONNECTION_REFUSED");
      return report("pass");
    });
    registerFitRunner(fitRunner(quiet, { retryDelayMs: 1 }));
    await syncBundles([fixtureBundle(`${LOOK}-r`, [fixtureTemplate("player")])]);
    await fitChecksSettled();
    expect(calls).toBe(3);
    expect((await version(`${LOOK}-r/player`)).fitStatus).toBe("pass");
  });

  it("leaves a check that can't run pending, and the sweep asks again", async () => {
    let calls = 0;
    setFitCheck(async () => {
      calls += 1;
      throw new Error("no harness");
    });
    registerFitRunner(fitRunner(quiet, { retries: 2, retryDelayMs: 1 }));
    await syncBundles([fixtureBundle(`${LOOK}-c`, [fixtureTemplate("player")])]);
    await fitChecksSettled();
    expect(calls).toBe(3);
    expect((await version(`${LOOK}-c/player`)).fitStatus).toBe("pending");

    setFitCheck(async () => report("pass"));
    const queued = await retryPendingFits(200, quiet);
    expect(queued).toBeGreaterThanOrEqual(1);
    await fitChecksSettled();
    expect((await version(`${LOOK}-c/player`)).fitStatus).toBe("pass");
  });

  it("queues one check per target, however often it's asked", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    setFitCheck(async () => {
      calls += 1;
      await gate;
      return report("pass");
    });
    const run = fitRunner(quiet);
    const target = { kind: "libraryVersion" as const, templateId: -1, version: 1 };
    run(target, {}, "player");
    run(target, {}, "player");
    release();
    await fitChecksSettled();
    expect(calls).toBe(1);
  });

  it("doesn't start where headless renders can't run", () => {
    const had = { url: process.env.RENDER_HARNESS_URL, origin: process.env.RENDER_HARNESS_ORIGIN };
    delete process.env.RENDER_HARNESS_URL;
    delete process.env.RENDER_HARNESS_ORIGIN;
    try {
      expect(startFitJob(quiet)).toBe(false);
    } finally {
      if (had.url !== undefined) process.env.RENDER_HARNESS_URL = had.url;
      if (had.origin !== undefined) process.env.RENDER_HARNESS_ORIGIN = had.origin;
    }
  });
});

describe("the render queue", () => {
  it("runs waiting card renders before waiting fit checks, one job at a time", async () => {
    const order: string[] = [];
    let running = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const job = (name: string, wait?: Promise<void>) => async () => {
      running += 1;
      expect(running).toBe(1);
      order.push(name);
      if (wait) await wait;
      running -= 1;
      return name;
    };
    const first = serialisedRender(job("render-1", gate));
    const fit = serialisedFitCheck(job("fit"));
    const second = serialisedRender(job("render-2"));
    release();
    await Promise.all([first, fit, second]);
    expect(order).toEqual(["render-1", "render-2", "fit"]);
  });

  it("keeps going after a job fails", async () => {
    const failed = serialisedFitCheck(async () => {
      throw new Error("boom");
    });
    await expect(failed).rejects.toThrow("boom");
    await expect(serialisedRender(async () => "after")).resolves.toBe("after");
  });
});
