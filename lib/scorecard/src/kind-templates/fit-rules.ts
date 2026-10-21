/**
 * The fit check's pure rules and its report (ADR-011 §4, L2-B): what every
 * page must bind, how many rows a page's list holds, and the report the
 * harness `fitCheck` returns, the server stores on a version or copy
 * (`fit_report`) and the bundle check prints.
 *
 * The DOM half (overflow after fit, rows in their box, nothing data-bearing
 * off the artboard, image and vector policy) is `template-fit.ts` in the web
 * app; it runs every variant `fitMatrix` lists with `worstCaseCard` content.
 */
import { documentRowsCapacity, layerOnSize, type TemplateSize } from "./document";
import { layerTokens } from "./drop-rule";
import { contentFields, isContentKind } from "./fields";
import {
  flattenLayers,
  isGroupLayer,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateLayerV2,
} from "./format";
import { tokenContentField } from "./page-tokens";
import { templateKindFor } from "./pages";
import type { LayoutWarningReason } from "./warnings";

/** Bump when the renderer changes how a template draws, so stored reports show their age. */
export const TEMPLATE_FIT_VERSION = "2026-10-22.1";

/** Why a variant fails the fit check: a layout warning, or a fit rule. */
export type FitIssueReason =
  | LayoutWarningReason
  /** A core content field has no layer on this page and size. */
  | "core-missing"
  /** A layer drawn although every field it shows is hidden. */
  | "hidden-shown"
  /** A list holds no rows on this size. */
  | "rows-capacity"
  /** A list's rows run outside its box at capacity. */
  | "rows-overflow"
  /** Something that shows data sits outside the artboard. */
  | "off-artboard"
  /** An image from somewhere a template may not load from. */
  | "image-url"
  /** A vector with markup the sanitiser should have removed. */
  | "vector-unsafe";

export type FitIssue = {
  /** The variant's label (`fitVariantLabel`), or `<page>.<size>` for a page-level rule. */
  variant: string;
  page: PageKey;
  size: TemplateSize;
  reason: FitIssueReason;
  layerId?: string;
  row?: number;
  field?: string;
  detail?: string;
};

export type TemplateFitReport = {
  kind: string;
  status: "pass" | "fail";
  /** How many variants were drawn. */
  variants: number;
  issues: FitIssue[];
  /** The renderer (`TEMPLATE_FIT_VERSION`) and font catalogue the check ran against. */
  renderer: string;
  fonts: string;
  checkedAt: string;
};

/** The most issues a report keeps; the count beyond it is in `truncated`. */
export const MAX_FIT_ISSUES = 200;

const SLIDE_OF: Partial<Record<PageKey, string>> = {
  title: "title",
  fixture: "fixture",
  sponsors: "sponsors",
  result: "result",
  team: "team",
};

/** The layers a page draws on `size`, groups' children included (hidden ones left out). */
export function pageLayersOnSize(
  doc: TemplateDocumentV2,
  page: PageKey,
  size: TemplateSize,
): TemplateLayerV2[] {
  return flattenLayers(doc.pages[page]?.layers ?? []).filter(
    (l) => !l.hidden && layerOnSize(l, size) && (isGroupLayer(l) || !!l.geometry?.[size]),
  );
}

/**
 * The core content fields (ADR-010) a page shows for `contentKind`: they are
 * always on, so a template must bind each on every size it covers. A junior
 * day slide's core is its list of games or results.
 */
export function pageCoreFields(contentKind: string, page: PageKey): string[] {
  if (!isContentKind(contentKind)) return [];
  if (page === "day") return ["dayRows"];
  const slide = SLIDE_OF[page];
  return contentFields(contentKind)
    .filter((f) => f.tier === "core" && f.key.split(".")[0] === slide)
    .map((f) => f.key);
}

/** The core content fields with no layer bound to them on this page and size. */
export function missingCoreFields(
  doc: TemplateDocumentV2,
  kind: string,
  contentKind: string,
  page: PageKey,
  size: TemplateSize,
): string[] {
  const core = pageCoreFields(contentKind, page);
  if (core.length === 0) return [];
  const templateKind = templateKindFor(kind);
  const tokens = new Set(pageLayersOnSize(doc, page, size).flatMap(layerTokens));
  const covered = new Set<string>();
  for (const token of tokens) {
    covered.add(token);
    const field = tokenContentField(templateKind, page, token);
    if (field) covered.add(field);
  }
  return core.filter((field) => !covered.has(field));
}

/** How many rows a page's first list bound to `repeat` holds on `size`, or null without one. */
export function pageRowsCapacity(
  doc: TemplateDocumentV2,
  page: PageKey,
  size: TemplateSize,
  repeat: string,
): number | null {
  return documentRowsCapacity({ layers: pageLayersOnSize(doc, page, size) }, size, repeat);
}

/** Every repeat a page's lists bind on `size`, with its capacity there. */
export function pageRepeatCapacities(
  doc: TemplateDocumentV2,
  page: PageKey,
  size: TemplateSize,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const layer of pageLayersOnSize(doc, page, size)) {
    if (layer.kind !== "rows" || !layer.rows?.repeat || layer.rows.repeat in out) continue;
    out[layer.rows.repeat] = pageRowsCapacity(doc, page, size, layer.rows.repeat) ?? 0;
  }
  return out;
}

/** A report from its issues, capped at `MAX_FIT_ISSUES`. */
export function fitReport(
  kind: string,
  variants: number,
  issues: FitIssue[],
  meta: { fonts: string; checkedAt?: string },
): TemplateFitReport & { truncated?: number } {
  const kept = issues.slice(0, MAX_FIT_ISSUES);
  return {
    kind,
    status: issues.length === 0 ? "pass" : "fail",
    variants,
    issues: kept,
    ...(issues.length > kept.length ? { truncated: issues.length - kept.length } : {}),
    renderer: TEMPLATE_FIT_VERSION,
    fonts: meta.fonts,
    checkedAt: meta.checkedAt ?? new Date().toISOString(),
  };
}

/** A one-line summary of a report, for logs and the proofs sheet. */
export function fitReportSummary(
  report: Pick<TemplateFitReport, "status" | "variants" | "issues">,
) {
  if (report.status === "pass") return `pass · ${report.variants} variants`;
  const reasons = new Map<string, number>();
  for (const issue of report.issues)
    reasons.set(issue.reason, (reasons.get(issue.reason) ?? 0) + 1);
  const parts = [...reasons].map(([reason, n]) => `${n} ${reason}`);
  return `fail · ${report.variants} variants · ${parts.join(", ")}`;
}
