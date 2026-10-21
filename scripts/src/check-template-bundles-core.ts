/**
 * The bundle fit check's pure parts (L2-B, T2.8): which bundle templates to
 * check, and the report it writes. `check-template-bundles.ts` drives the
 * browser.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fitReportSummary, type TemplateFitReport } from "@workspace/scorecard/kind-templates";

/** One template to check: a bundle's `<look>/<kind>.json`, or a TypeScript starter. */
export type FitTarget = {
  /** `club-kit/matchDay`, or `starter:club-kit/matchDay`. */
  id: string;
  kind: string;
  document: unknown;
  /** sha256 of the bundle file (bundles only). */
  hash?: string;
  /** The bundle file, relative to the repo root (bundles only). */
  file?: string;
};

/**
 * A change to any of these re-checks every bundle: the renderer, the
 * format, the harness or the fit check itself.
 */
export const RENDERER_PATHS = [
  "artifacts/cricket-club/src/lib/pack-render/",
  "artifacts/cricket-club/src/components/pack-card.tsx",
  "artifacts/cricket-club/src/pages/card-render-harness.tsx",
  "artifacts/cricket-club/src/lib/document-fonts.ts",
  "artifacts/cricket-club/src/lib/card-fonts.ts",
  "lib/scorecard/src/kind-templates/",
  "scripts/src/check-template-bundles",
] as const;

export const BUNDLES_DIR = "lib/template-bundles";

const LOOK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KIND = /^[a-z][A-Za-z0-9]*$/;

/** Every bundle template under `<root>/lib/template-bundles`, sorted by look then kind. */
export function readBundleTargets(root: string): FitTarget[] {
  const dir = path.join(root, BUNDLES_DIR);
  if (!existsSync(dir)) return [];
  const out: FitTarget[] = [];
  const looks = readdirSync(dir)
    .filter((name) => LOOK.test(name) && statSync(path.join(dir, name)).isDirectory())
    .sort();
  for (const look of looks) {
    const kinds = readdirSync(path.join(dir, look))
      .filter((f) => f.endsWith(".json") && f !== "look.json")
      .map((f) => f.slice(0, -".json".length))
      .filter((kind) => KIND.test(kind))
      .sort();
    for (const kind of kinds) {
      const file = path.join(BUNDLES_DIR, look, `${kind}.json`);
      // Line endings normalised, so a Windows checkout hashes as CI does (as generate-index).
      const text = readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
      const parsed = JSON.parse(text) as { document?: unknown };
      out.push({
        id: `${look}/${kind}`,
        kind,
        document: parsed.document,
        hash: createHash("sha256").update(text).digest("hex"),
        file: file.split(path.sep).join("/"),
      });
    }
  }
  return out;
}

/**
 * The bundle templates a change needs checked: every one when the renderer,
 * format or check changed, else only the bundle files that changed.
 */
export function selectChanged(
  targets: readonly FitTarget[],
  changedFiles: readonly string[],
): FitTarget[] {
  const changed = changedFiles.map((f) => f.split("\\").join("/"));
  if (changed.some((f) => RENDERER_PATHS.some((p) => f.startsWith(p)))) return [...targets];
  const files = new Set(changed);
  return targets.filter((t) => t.file && files.has(t.file));
}

export type CheckedTemplate = {
  target: FitTarget;
  report: TemplateFitReport | null;
  error?: string;
};

/** Whether a check failed: a report that didn't pass, or no report at all. */
export const checkFailed = (c: CheckedTemplate) => !c.report || c.report.status !== "pass";

/** The Markdown report: a line per template, then each failure's issues. */
export function renderReport(
  checked: readonly CheckedTemplate[],
  meta: { selection: string },
): string {
  const failed = checked.filter(checkFailed);
  const lines = [
    "# Template bundle fit check",
    "",
    `${checked.length} template${checked.length === 1 ? "" : "s"} checked (${meta.selection}); ` +
      `${failed.length} failed.`,
    "",
  ];
  if (checked.length > 0) {
    lines.push("| Template | Result |", "| --- | --- |");
    for (const c of checked)
      lines.push(
        `| ${c.target.id} | ${c.report ? fitReportSummary(c.report) : `error · ${c.error ?? "no report"}`} |`,
      );
    lines.push("");
  }
  for (const c of failed) {
    lines.push(`## ${c.target.id}`, "");
    if (!c.report) {
      lines.push(`The check couldn't run: ${c.error ?? "no report"}.`, "");
      continue;
    }
    for (const issue of c.report.issues) {
      const where = [
        issue.layerId && `layer ${issue.layerId}`,
        issue.field && `field ${issue.field}`,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `- \`${issue.variant}\` ${issue.reason}${where ? ` (${where})` : ""}${issue.detail ? `: ${issue.detail}` : ""}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
