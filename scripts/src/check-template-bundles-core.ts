/**
 * The bundle fit check's pure parts (L2-B, T2.8): which bundle templates to
 * check, and the report it writes. `check-template-bundles.ts` drives the
 * browser.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  assembleSetDocument,
  fitMatrix,
  fitReport,
  fitReportSummary,
  isSetDocument,
  setPageDocument,
  setTemplateKind,
  type DataSetType,
  type FitIssue,
  type TemplateFitReport,
} from "@workspace/scorecard/kind-templates";

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
  /** Whether the bundle asks to be listed; an unlisted bundle is work in progress. */
  listed?: boolean;
  /**
   * A set template's pages (`<look>/set:<type>`, assembled from the look's
   * bundles): the kind target each page is, page for page.
   */
  parts?: Array<{ pageId: string; target: string; page: string }>;
};

/** The set templates the server assembles for every look (`bundleSetTemplates`). */
export const BUNDLE_SET_TYPES: readonly DataSetType[] = [
  "teamLists",
  "matchDay",
  "results",
  "matchSummary",
];

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
    // A look folder has a look.json; the element library's `elements/` doesn't.
    .filter((name) => LOOK.test(name) && existsSync(path.join(dir, name, "look.json")))
    .sort();
  for (const look of looks) {
    const kinds = readdirSync(path.join(dir, look))
      .filter((f) => f.endsWith(".json") && f !== "look.json")
      .map((f) => f.slice(0, -".json".length))
      .filter((kind) => KIND.test(kind))
      .sort();
    const lookTargets: FitTarget[] = [];
    for (const kind of kinds) {
      const file = path.join(BUNDLES_DIR, look, `${kind}.json`);
      // Line endings normalised, so a Windows checkout hashes as CI does (as generate-index).
      const text = readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
      const parsed = JSON.parse(text) as { document?: unknown; listed?: unknown };
      lookTargets.push({
        id: `${look}/${kind}`,
        kind,
        listed: parsed.listed === true,
        document: parsed.document,
        hash: createHash("sha256").update(text).digest("hex"),
        file: file.split(path.sep).join("/"),
      });
    }
    out.push(...lookTargets, ...setTargets(look, lookTargets));
  }
  return out;
}

/** A look's set templates, assembled from its kind targets as the server does. */
function setTargets(look: string, kinds: readonly FitTarget[]): FitTarget[] {
  const byKind = new Map(kinds.map((t) => [t.kind, t]));
  const out: FitTarget[] = [];
  for (const type of BUNDLE_SET_TYPES) {
    const built = assembleSetDocument(type, (kind) => byKind.get(kind)?.document);
    if (!built) continue;
    const parts = new Set(built.document.pages.map((p) => p.kind));
    out.push({
      id: `${look}/${setTemplateKind(type)}`,
      kind: setTemplateKind(type),
      // Listed when every part is (bundleSetTemplates); else work in progress, reported only.
      listed: [...parts].every((k) => byKind.get(k)?.listed === true),
      document: built.document,
      parts: built.document.pages.map((p) => ({
        pageId: p.id,
        target: `${look}/${p.kind}`,
        page: p.page,
      })),
    });
  }
  return out;
}

/**
 * A set target's report from its parts' reports, when every part was checked:
 * a set page is its kind's page unchanged, so it fits exactly as that page
 * does, and checking it again would only double the run. Null when a part
 * wasn't checked (the set is then checked on its own).
 */
export function setReportFromParts(
  target: FitTarget,
  reports: ReadonlyMap<string, TemplateFitReport>,
): TemplateFitReport | null {
  if (!target.parts || !isSetDocument(target.document)) return null;
  const set = target.document;
  const issues: FitIssue[] = [];
  let variants = 0;
  let fonts = "unknown";
  for (const part of target.parts) {
    const report = reports.get(part.target);
    const page = set.pages.find((p) => p.id === part.pageId);
    // A report cut short may have dropped this page's issues: check the set itself.
    if (!report || !page || (report as { truncated?: number }).truncated) return null;
    fonts = report.fonts;
    for (const issue of report.issues)
      if (issue.page === part.page)
        issues.push({ ...issue, variant: `${part.pageId}:${issue.variant}` });
    variants += fitMatrix(setPageDocument(set, page), page.kind).length;
  }
  return fitReport(target.kind, variants, issues, { fonts });
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
  const picked = new Set(targets.filter((t) => t.file && files.has(t.file)).map((t) => t.id));
  // A set is re-checked when any kind it is made of is.
  return targets.filter(
    (t) => picked.has(t.id) || (t.parts?.some((p) => picked.has(p.target)) ?? false),
  );
}

export type CheckedTemplate = {
  target: FitTarget;
  report: TemplateFitReport | null;
  error?: string;
};

/** Whether a check failed: a report that didn't pass, or no report at all. */
export const checkFailed = (c: CheckedTemplate) => !c.report || c.report.status !== "pass";

/**
 * Listed bundles known to fail today, by id, with why (`check-template-bundles.known-failures.json`).
 * Polish takes each one off; the list only ever shrinks.
 */
export type KnownFailures = Record<string, string>;

export type Gate = {
  /** Failures that fail the check: listed (or starter) templates not on the known list. */
  blocking: CheckedTemplate[];
  /** Listed templates on the known list that still fail. */
  known: CheckedTemplate[];
  /** Unlisted templates that fail: work in progress, reported only. */
  unlisted: CheckedTemplate[];
  /** Templates on the known list that now pass: take them off it. */
  nowPassing: string[];
};

/**
 * Which failures fail the check (L2-B). A listed bundle must pass, unless it's
 * on the known-failures list; an unlisted one (a raw conversion, a starter
 * page in progress) is reported but never blocks. The server lists a template
 * only once it passes either way.
 */
export function gateFailures(checked: readonly CheckedTemplate[], known: KnownFailures): Gate {
  const gate: Gate = { blocking: [], known: [], unlisted: [], nowPassing: [] };
  for (const c of checked) {
    if (!checkFailed(c)) {
      if (Object.prototype.hasOwnProperty.call(known, c.target.id))
        gate.nowPassing.push(c.target.id);
      continue;
    }
    if (c.target.listed === false) gate.unlisted.push(c);
    else if (Object.prototype.hasOwnProperty.call(known, c.target.id)) gate.known.push(c);
    else gate.blocking.push(c);
  }
  return gate;
}

/** The Markdown report: a line per template, then each failure's issues. */
export function renderReport(
  checked: readonly CheckedTemplate[],
  meta: { selection: string; known?: KnownFailures },
): string {
  const failed = checked.filter(checkFailed);
  const gate = gateFailures(checked, meta.known ?? {});
  const lines = [
    "# Template bundle fit check",
    "",
    `${checked.length} template${checked.length === 1 ? "" : "s"} checked (${meta.selection}); ` +
      `${failed.length} failed.`,
    "",
    `- Blocking (listed, not a known failure): ${gate.blocking.length}`,
    `- Known failures still failing: ${gate.known.length}`,
    `- Unlisted, reported only: ${gate.unlisted.length}`,
    ...(gate.nowPassing.length
      ? [`- Now passing, take off the known-failures list: ${gate.nowPassing.join(", ")}`]
      : []),
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
