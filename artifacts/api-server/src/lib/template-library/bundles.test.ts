/**
 * Bundle sync at boot (ADR-011 T3.3, T3.4) and the library's fit gate.
 * Real-DB test (needs DATABASE_URL).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateLooksTable,
} from "@workspace/db";
import { renderIndex } from "../../../../../lib/template-bundles/generate-index.mjs";
import { syncBundles } from "./bundles";
import { fixtureBundle, fixtureTemplate, v2Document } from "./bundles.test-helpers";
import { registerFitRunner, writeFitResult, type FitTarget } from "./fit";
import { listLibraryLooks, listLibraryTemplates } from "./store";

const ROOT = path.resolve(__dirname, "../../../../..");
const STAMP = Date.now();
const LOOK = `t-${STAMP}`;

async function cleanup(): Promise<void> {
  const templates = await db
    .select({ id: libraryTemplatesTable.id })
    .from(libraryTemplatesTable)
    .where(like(libraryTemplatesTable.slug, `t-${STAMP}%`));
  if (templates.length > 0) {
    await db.delete(libraryTemplatesTable).where(
      inArray(
        libraryTemplatesTable.id,
        templates.map((t) => t.id),
      ),
    );
  }
  await db.delete(templateLooksTable).where(like(templateLooksTable.slug, `t-${STAMP}%`));
}

afterEach(() => registerFitRunner(null));
afterAll(cleanup);

const rowsFor = async (slug: string) => {
  const [t] = await db
    .select()
    .from(libraryTemplatesTable)
    .where(eq(libraryTemplatesTable.slug, slug));
  const versions = t
    ? await db
        .select()
        .from(libraryTemplateVersionsTable)
        .where(eq(libraryTemplateVersionsTable.templateId, t.id))
    : [];
  return { template: t, versions };
};

describe("syncBundles", () => {
  it("loads looks and templates, and a second (or parallel) boot changes nothing", async () => {
    const bundles = [
      fixtureBundle(LOOK, [fixtureTemplate("milestone"), fixtureTemplate("matchDay")]),
    ];
    const [a, b] = await Promise.all([syncBundles(bundles), syncBundles(bundles)]);
    expect(a.skipped).toEqual([]);
    expect(b.skipped).toEqual([]);
    expect(a.versionsAdded + b.versionsAdded).toBe(2);
    const again = await syncBundles(bundles);
    expect(again.versionsAdded).toBe(0);

    const looks = await db
      .select()
      .from(templateLooksTable)
      .where(eq(templateLooksTable.slug, LOOK));
    expect(looks).toHaveLength(1);
    expect(looks[0]!.origin).toBe("bundle");
    const { template, versions } = await rowsFor(`${LOOK}/milestone`);
    expect(template?.origin).toBe("bundle");
    expect(template?.currentVersion).toBe(1);
    expect(template?.listed).toBe(true);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.coverage.pages).toEqual(["card"]);
    // No fit job registered yet (L2-B): the version is recorded as passed, skipped.
    expect(versions[0]!.fitStatus).toBe("pass");
    expect(versions[0]!.fitReport).toMatchObject({ skipped: true });
  });

  it("adds a raised version, and keeps a version edited without a bump", async () => {
    const v2 = fixtureTemplate("milestone", { version: 2, name: "Milestone v2" });
    const s = await syncBundles([fixtureBundle(LOOK, [v2, fixtureTemplate("matchDay")])]);
    expect(s.versionsAdded).toBe(1);
    const { template, versions } = await rowsFor(`${LOOK}/milestone`);
    expect(template?.currentVersion).toBe(2);
    expect(template?.name).toBe("Milestone v2");
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const edited = fixtureTemplate("milestone", { version: 2, name: "Edited without a bump" });
    const s2 = await syncBundles([fixtureBundle(LOOK, [edited, fixtureTemplate("matchDay")])]);
    expect(s2.skipped).toEqual([
      expect.objectContaining({
        slug: `${LOOK}/milestone`,
        reason: expect.stringContaining("version bump"),
      }),
    ]);
    const after = (await rowsFor(`${LOOK}/milestone`)).versions;
    expect(after.find((v) => v.version === 2)!.bundleHash).toBe(v2.hash);
  });

  it("skips an invalid template and unlists one removed from the bundles", async () => {
    const bad = fixtureTemplate("milestone", {
      version: 3,
      document: {
        layers: [{ id: "x", kind: "image", content: "https://example.com/a.png", geometry: {} }],
      },
    });
    const s = await syncBundles([fixtureBundle(LOOK, [bad])]);
    expect(s.skipped.map((x) => x.slug)).toEqual([`${LOOK}/milestone`]);
    expect(s.retired).toBeGreaterThanOrEqual(1);
    const { template } = await rowsFor(`${LOOK}/matchDay`);
    expect(template?.listed).toBe(false);
    expect(template?.unlistReason).toBe("Removed from the bundles.");
    // Coming back relists it.
    await syncBundles([fixtureBundle(LOOK, [fixtureTemplate("matchDay")])]);
    expect((await rowsFor(`${LOOK}/matchDay`)).template?.listed).toBe(true);
  });

  it("syncs a format v2 template, and skips one the v2 rules refuse (T3.6, L1-B)", async () => {
    const good = fixtureTemplate("matchDay", {
      version: 4,
      document: v2Document("matchDay", ["title"]),
    });
    const ok = await syncBundles([fixtureBundle(`${LOOK}-v2`, [good])]);
    expect(ok.skipped).toEqual([]);
    const { versions } = await rowsFor(`${LOOK}-v2/matchDay`);
    expect(versions.at(-1)?.coverage.pages).toEqual(expect.arrayContaining(["fixture", "title"]));

    const doc = v2Document("milestone") as { pages: Record<string, { layers: object[] }> };
    const page = Object.values(doc.pages)[0]!;
    page.layers[0] = { ...page.layers[0], showWhen: { field: "notAField" } };
    const bad = fixtureTemplate("milestone", { document: doc });
    const s = await syncBundles([fixtureBundle(`${LOOK}-v2bad`, [bad])]);
    expect(s.skipped).toEqual([
      { slug: `${LOOK}-v2bad/milestone`, reason: expect.stringMatching(/showWhen\.field/) },
    ]);
  });

  it("lists a template only once its current version passes the fit check", async () => {
    const targets: FitTarget[] = [];
    registerFitRunner((target) => targets.push(target));
    const slug = `${LOOK}-fit`;
    await syncBundles([fixtureBundle(slug, [fixtureTemplate("record")])]);
    expect(targets).toHaveLength(1);
    const { versions } = await rowsFor(`${slug}/record`);
    expect(versions[0]!.fitStatus).toBe("pending");
    const visible = async () =>
      (await listLibraryTemplates({ look: slug })).templates.map((t) => t.slug);
    expect(await visible()).toEqual([]);
    expect((await listLibraryLooks()).some((l) => l.slug === slug)).toBe(false);

    await writeFitResult(targets[0]!, { status: "pass", report: { warnings: [] } });
    expect(await visible()).toEqual([`${slug}/record`]);
    expect((await listLibraryLooks()).find((l) => l.slug === slug)?.templates).toHaveLength(1);
  });
});

describe("the bundles package", () => {
  it("has an up-to-date generated index", () => {
    const committed = readFileSync(path.join(ROOT, "lib/template-bundles/index.ts"), "utf8");
    expect(committed.replace(/\r\n/g, "\n")).toBe(
      renderIndex(path.join(ROOT, "lib/template-bundles")),
    );
  });

  it("is never imported by the web app", () => {
    const web = path.join(ROOT, "artifacts/cricket-club");
    const pkg = JSON.parse(readFileSync(path.join(web, "package.json"), "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty(
      "@workspace/template-bundles",
    );
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.(ts|tsx)$/.test(name) &&
          readFileSync(full, "utf8").includes("template-bundles")
        ) {
          offenders.push(path.relative(web, full));
        }
      }
    };
    walk(path.join(web, "src"));
    expect(offenders).toEqual([]);
  });
});
