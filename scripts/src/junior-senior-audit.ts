/**
 * Junior and senior cards side by side (Ash, retest 3, Nov 2026): every look's
 * junior pages drawn next to their senior counterparts in a real browser, the
 * drawn layers compared, and (optionally) the pairs saved as JPGs.
 *
 *   pnpm --filter @workspace/scripts exec tsx ./src/junior-senior-audit.ts
 *     [--looks=<look,...>]     default every look with a junior kind
 *     [--kinds=<kind,...>]     default the kinds a junior card can be
 *     [--sizes=<size,...>]     default every size the page covers
 *     [--shots=<dir>]          save a senior | junior JPG per page and size
 *     [--out=<file>]           the audit as JSON (default scripts/exports/junior-senior/audit.json)
 *     [--senior-out=<dir>]     save each senior render (with and without its photo) as a PNG,
 *                              to compare before and after a bundle change
 *     [--bundles-root=<dir>]   read the bundles under <dir>/lib/template-bundles (e.g. a
 *                              `git archive` of another commit) instead of this checkout's
 *     [--skip-build]           reuse the last production build
 *
 * A junior card draws the same layout as its senior counterpart: what may
 * differ is the photo (approved junior stock or none), privacy ("Private
 * Player"), the junior heading and the stats juniors don't carry. The audit
 * reports every layer a junior draws that the senior page without a photo
 * doesn't (or the other way round), and every shared layer drawn at another
 * box or type size, so anything else shows up.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "puppeteer-core";
import {
  fitMatrix,
  normaliseDocument,
  pageRepeatCapacities,
  pageUsesPhoto,
  worstCaseCard,
  flattenLayers,
  layerTokens,
  type FitVariant,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import { REPO_ROOT, callHarness, withHarness } from "./lib/harness-browser";
import { readBundleTargets } from "./check-template-bundles-core";

/** The kinds a junior card or set can be, with the pages a junior draws. */
export const JUNIOR_KIND_PAGES: Readonly<Record<string, readonly PageKey[]>> = {
  teamList: ["team"],
  matchDay: ["fixture", "title", "sponsors"],
  matchSummary: ["result"],
  milestone: ["card"],
  century: ["card"],
  fiveFor: ["card"],
};

/** Images that look like a real card: the club's logo, a team photo, partner logos. */
export function sampleImage(name: string): string {
  if (/^sponsor|Sponsor|weekendSponsor|playerSponsor/.test(name))
    return `/mockup/partner-${((Number(/\d+/.exec(name)?.[0] ?? 1) - 1) % 3) + 1}.svg`;
  if (/^club/.test(name)) return "/mockup/club-logo.png";
  if (/photo|Photo/.test(name)) return "/mockup/club-team-photo.jpg";
  return "/placeholder-club-logo.svg";
}

type Drawn = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The largest font size drawn inside the layer, px. */
  font: number;
  text: string;
};

type Side = "senior-photo" | "senior" | "junior";

export type PairDiff = {
  look: string;
  kind: string;
  contentKind: string;
  page: PageKey;
  size: TemplateSize;
  /** Layers only the junior draws, and only the senior page without a photo draws. */
  juniorOnly: string[];
  seniorOnly: string[];
  /** Layers the senior page draws with its photo that the junior doesn't. */
  photoOnly: string[];
  /** Shared layers drawn at another box (> 2 px) or type size (> 0.5 px). */
  moved: Array<{ id: string; senior: Drawn; junior: Drawn }>;
  /**
   * Decoration a junior still draws beside data it doesn't have: a label,
   * bullet or rule with no field of its own, in line with a data layer the
   * senior draws and the junior doesn't ("LAST MET" with no last meeting).
   */
  orphans: Array<{ id: string; beside: string }>;
  /** Whether the page has a designed no-photo layer (`showWhen.photo: false`). */
  noPhotoVariant: boolean;
  /** Share of the card the senior photo covers (0..1). */
  photoArea: number;
};

/**
 * Every drawn layer's box, largest type size and text, in the page. Sent as
 * source: the scripts package has no DOM types.
 */
const DRAWN_LAYERS = `(() => {
  const root = document.querySelector("#pack-still-root");
  const art = (root.querySelector(".pack-card-root") || root).getBoundingClientRect();
  const out = [];
  for (const el of Array.from(root.querySelectorAll("[data-layer-id]"))) {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    let font = 0;
    for (const t of Array.from(el.querySelectorAll("*")).concat(el)) {
      const own = Array.from(t.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim());
      if (own) font = Math.max(font, parseFloat(getComputedStyle(t).fontSize) || 0);
    }
    out.push({
      id: el.getAttribute("data-layer-id") || "",
      x: Math.round(r.left - art.left),
      y: Math.round(r.top - art.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
      font: Math.round(font * 10) / 10,
      text: (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 60),
    });
  }
  return { layers: out, w: art.width, h: art.height };
})()`;

async function drawnLayers(page: Page): Promise<{ layers: Drawn[]; w: number; h: number }> {
  return (await page.evaluate(DRAWN_LAYERS)) as { layers: Drawn[]; w: number; h: number };
}

async function draw(
  page: Page,
  doc: unknown,
  kind: string,
  variant: FitVariant,
): Promise<{ layers: Drawn[]; w: number; h: number; png: string }> {
  const normal = normaliseDocument(doc, kind) as TemplateDocumentV2;
  const rows = pageRepeatCapacities(normal, variant.page, variant.size);
  // A realistic side: eleven players (the fit check draws 12 to 14).
  if (rows.players !== undefined) rows.players = Math.min(rows.players, 11);
  if (rows.sponsors !== undefined) rows.sponsors = Math.min(rows.sponsors, 6);
  const card = worstCaseCard(kind, variant, { rows, image: sampleImage });
  if (variant.junior && variant.page === "card") {
    // A junior card as the server builds it: first name and surname initial,
    // no shirt or cap number (junior privacy).
    const input = card.input as Record<string, unknown>;
    const [first, ...rest] = String(input.playerName ?? "").split(" ");
    if (first) input.playerName = `${first} ${(rest.at(-1) ?? "").charAt(0)}.`.trim();
    delete input.shirtNumber;
    delete input.capNumber;
  }
  const meta = await callHarness<{ selector: string }>(page, "renderStill", {
    input: card.input,
    options: {
      size: variant.size,
      sponsorsOn: card.sponsorsOn,
      junior: card.junior,
      data: card.data,
      packId: "blank",
      adjustments: doc,
      page: variant.page,
    },
  });
  const drawn = await drawnLayers(page);
  const el = await page.$(meta.selector);
  const png = Buffer.from(await el!.screenshot({ type: "png" })).toString("base64");
  return { ...drawn, png };
}

const near = (a: Drawn, b: Drawn) =>
  Math.abs(a.x - b.x) <= 2 &&
  Math.abs(a.y - b.y) <= 2 &&
  Math.abs(a.w - b.w) <= 2 &&
  Math.abs(a.h - b.h) <= 2 &&
  Math.abs(a.font - b.font) <= 0.5;

function hasNoPhotoLayer(doc: TemplateDocumentV2, page: PageKey): boolean {
  const walk = (ls: readonly unknown[]): boolean =>
    ls.some((l) => {
      const layer = l as { showWhen?: { photo?: boolean }; children?: unknown[] };
      return layer.showWhen?.photo === false || (!!layer.children && walk(layer.children));
    });
  return walk(doc.pages[page]?.layers ?? []);
}

/** Senior and junior side by side, labelled, as a JPG. */
async function sideBySide(page: Page, left: string, right: string, title: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#1b1b1b;font:600 28px system-ui;color:#eee">
    <div style="padding:16px 24px">${title}</div>
    <div style="display:flex;gap:24px;padding:0 24px 24px">
      <figure style="margin:0"><figcaption style="padding:0 0 8px">Senior</figcaption><img src="data:image/png;base64,${left}" style="display:block;width:540px"></figure>
      <figure style="margin:0"><figcaption style="padding:0 0 8px">Junior</figcaption><img src="data:image/png;base64,${right}" style="display:block;width:540px"></figure>
    </div></body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  const body = await page.$("body");
  return Buffer.from(await body!.screenshot({ type: "jpeg", quality: 82 }));
}

export interface AuditOptions {
  looks: string[] | null;
  kinds: string[] | null;
  sizes: TemplateSize[] | null;
  shots: string | null;
  out: string;
  skipBuild: boolean;
  seniorOut: string | null;
  bundlesRoot: string | null;
}

function parseArgs(argv: readonly string[]): AuditOptions {
  const args = new Map<string, string>();
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) args.set(m[1]!, m[2] ?? "true");
  }
  const list = (k: string) => args.get(k)?.split(",").filter(Boolean) ?? null;
  return {
    looks: list("looks"),
    kinds: list("kinds"),
    sizes: list("sizes") as TemplateSize[] | null,
    shots: args.get("shots") ?? null,
    out:
      args.get("out") ?? path.join(REPO_ROOT, "scripts", "exports", "junior-senior", "audit.json"),
    skipBuild: args.get("skip-build") === "true",
    seniorOut: args.get("senior-out") ?? null,
    bundlesRoot: args.get("bundles-root") ?? null,
  };
}

export async function auditJuniorSenior(opts: AuditOptions): Promise<PairDiff[]> {
  const targets = readBundleTargets(opts.bundlesRoot ?? REPO_ROOT).filter(
    (t) =>
      !t.parts &&
      JUNIOR_KIND_PAGES[t.kind] &&
      (!opts.looks || opts.looks.includes(t.id.split("/")[0]!)) &&
      (!opts.kinds || opts.kinds.includes(t.kind)),
  );
  const diffs: PairDiff[] = [];
  if (opts.shots) mkdirSync(opts.shots, { recursive: true });
  if (opts.seniorOut) mkdirSync(opts.seniorOut, { recursive: true });
  await withHarness({ skipBuild: opts.skipBuild }, async (session) => {
    const page = await session.openPage();
    const shotPage = opts.shots ? await session.openPage() : null;
    for (const t of targets) {
      const look = t.id.split("/")[0]!;
      const doc = normaliseDocument(t.document, t.kind) as TemplateDocumentV2;
      const contentKinds = t.kind === "matchSummary" ? ["matchSummary", "results"] : [t.kind];
      for (const contentKind of contentKinds)
        for (const pageKey of JUNIOR_KIND_PAGES[t.kind]!) {
          if (!doc.pages[pageKey]) continue;
          // The Results set shares the Match Summary result page; its bookends are Match Day's.
          const matrix = fitMatrix(doc, t.kind).filter(
            (v) => v.page === pageKey && v.contentKind === contentKind,
          );
          const sizes = [...new Set(matrix.map((v) => v.size))].filter(
            (s) => !opts.sizes || opts.sizes.includes(s),
          );
          const usesPhoto = pageUsesPhoto(doc, t.kind, pageKey);
          for (const size of sizes) {
            const base: FitVariant = {
              page: pageKey,
              size,
              contentKind,
              ...(matrix[0]?.preset ? { preset: "full" as const } : {}),
              ...(matrix.some((v) => v.sponsors) ? { sponsors: "max" as const } : {}),
              junior: false,
            };
            const sides: Partial<Record<Side, Awaited<ReturnType<typeof draw>>>> = {};
            if (usesPhoto)
              sides["senior-photo"] = await draw(page, t.document, t.kind, {
                ...base,
                photo: true,
              });
            sides.senior = await draw(page, t.document, t.kind, {
              ...base,
              ...(usesPhoto ? { photo: false } : {}),
            });
            sides.junior = await draw(page, t.document, t.kind, {
              ...base,
              ...(usesPhoto ? { photo: false } : {}),
              junior: true,
            });
            const s = new Map(sides.senior.layers.map((l) => [l.id, l]));
            const j = new Map(sides.junior.layers.map((l) => [l.id, l]));
            const sp = new Map((sides["senior-photo"]?.layers ?? []).map((l) => [l.id, l]));
            const photoLayers = [...sp.values()].filter((l) => !s.has(l.id));
            const area = sides.senior.w * sides.senior.h || 1;
            const photoArea = Math.min(
              1,
              photoLayers.reduce((sum, l) => sum + l.w * l.h, 0) / area,
            );
            const byId = new Map(
              flattenLayers(doc.pages[pageKey]?.layers ?? []).map((l) => [l.id, l]),
            );
            const dropped = [...s.values()].filter(
              (l) => !j.has(l.id) && layerTokens(byId.get(l.id)!).length > 0,
            );
            const orphans = [...j.values()]
              .filter((l) => {
                const layer = byId.get(l.id);
                return (
                  !!layer &&
                  layerTokens(layer).length === 0 &&
                  !layer.showWhen &&
                  l.w * l.h < area * 0.05
                );
              })
              .flatMap((l) => {
                const cy = l.y + l.h / 2;
                const beside = dropped.find(
                  (d) =>
                    cy >= d.y - 2 &&
                    cy <= d.y + d.h + 2 &&
                    (Math.abs(d.x - (l.x + l.w)) < sides.senior!.w * 0.06 ||
                      Math.abs(l.x - (d.x + d.w)) < sides.senior!.w * 0.06 ||
                      (l.x < d.x + d.w && d.x < l.x + l.w)),
                );
                return beside ? [{ id: l.id, beside: beside.id }] : [];
              });
            const diff: PairDiff = {
              look,
              kind: t.kind,
              contentKind,
              page: pageKey,
              size,
              juniorOnly: [...j.keys()].filter((id) => !s.has(id)),
              seniorOnly: [...s.keys()].filter((id) => !j.has(id)),
              photoOnly: photoLayers.map((l) => l.id),
              moved: [...j.values()]
                .filter((l) => s.has(l.id) && !near(l, s.get(l.id)!))
                .map((l) => ({ id: l.id, senior: s.get(l.id)!, junior: l })),
              orphans,
              noPhotoVariant: hasNoPhotoLayer(doc, pageKey),
              photoArea: Math.round(photoArea * 100) / 100,
            };
            diffs.push(diff);
            process.stderr.write(
              `[audit] ${t.id} ${contentKind}/${pageKey}/${size}: ` +
                `${diff.juniorOnly.length} junior-only, ${diff.seniorOnly.length} senior-only, ` +
                `${diff.moved.length} moved, ${orphans.length} orphans, photo ${diff.photoArea}\n`,
            );
            if (opts.seniorOut) {
              const base = `${look}-${contentKind === "results" ? "results" : t.kind}-${pageKey}-${size}`;
              for (const side of ["senior-photo", "senior"] as const) {
                const png = sides[side]?.png;
                if (png)
                  writeFileSync(
                    path.join(opts.seniorOut, `${base}-${side}.png`),
                    Buffer.from(png, "base64"),
                  );
              }
            }
            if (shotPage && opts.shots) {
              const senior = sides["senior-photo"] ?? sides.senior;
              const label = `${look} · ${contentKind === "results" ? "results" : t.kind} · ${pageKey} · ${size}`;
              const jpg = await sideBySide(shotPage, senior.png, sides.junior.png, label);
              const kindName = contentKind === "results" ? "results" : t.kind;
              writeFileSync(
                path.join(opts.shots, `${look}-${kindName}-${pageKey}-${size}.jpg`),
                jpg,
              );
            }
          }
        }
    }
    if (session.errors.length)
      process.stderr.write(`[audit] page errors:\n  ${session.errors.join("\n  ")}\n`);
  });
  mkdirSync(path.dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, `${JSON.stringify(diffs, null, 2)}\n`);
  process.stderr.write(`[audit] ${diffs.length} pairs; ${path.relative(REPO_ROOT, opts.out)}\n`);
  return diffs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  auditJuniorSenior(parseArgs(process.argv.slice(2))).catch((err) => {
    process.stderr.write(`[audit] ${String(err instanceof Error ? err.stack : err)}\n`);
    process.exit(2);
  });
}
