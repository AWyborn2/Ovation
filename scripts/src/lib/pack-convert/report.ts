/**
 * A converted look's `report.md` (L4-A2, task T4.10): per kind × page × size
 * what was mapped, what needs polish, the colours that aren't tokens, the
 * motion found and what it became, the fit result and a pixel-diff score
 * against the pack drawing the same input.
 */

import type { TemplateSize } from "@workspace/scorecard/kind-templates";
import type { KindConversion } from "./convert";

/** The driver's per-size checks of a converted page. */
export interface PageCheck {
  /** 0–1: the share of pixels that match the pack's render (same input, same size). */
  pixelMatch?: number;
  /** Layout warnings from the template render (text that still overflows at its minimum). */
  warnings?: string[];
  error?: string;
}

export type Checks = Record<string, Partial<Record<TemplateSize, PageCheck>>>;

export const checkKey = (kind: string, page: string) => `${kind}.${page}`;

const pct = (n: number | undefined) => (n === undefined ? "—" : `${Math.round(n * 100)}%`);

export function lookReport(opts: {
  look: string;
  packId: string;
  conversions: KindConversion[];
  checks: Checks;
  rendererNote?: string;
  /** Validator errors per kind; null when the validator doesn't read format v2 yet. */
  validation?: Record<string, string[]> | null;
  generatedAt: string;
  results?: { same: boolean; differences: string[] } | null;
  /** A re-check of the polished bundle (`--recheck`), not the raw conversion. */
  polish?: { halfDays: number | null; listed: number };
}): string {
  const { conversions, checks } = opts;
  const lines: string[] = [];
  const all = conversions.flatMap((c) => c.pages);
  const scores = all.flatMap((p) =>
    Object.values(checks[checkKey(p.kind, p.page)] ?? {})
      .map((c) => c?.pixelMatch)
      .filter((n): n is number => n !== undefined),
  );
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
  const motion = Object.assign({}, ...all.map((p) => p.motion)) as Record<string, string>;

  const polished = opts.polish;
  lines.push(`# ${opts.look}: ${polished ? "conversion" : "raw conversion"} report`);
  lines.push("");
  lines.push(
    polished
      ? `Converted from the \`${opts.packId}\` pack by \`scripts/src/convert-pack.ts\`, polished by hand, ` +
          `re-checked against the pack on ${opts.generatedAt}. Status: **polished, pending Ash's sign-off**; ` +
          `${polished.listed} of ${conversions.length} kinds listed.`
      : `Converted from the \`${opts.packId}\` pack by \`scripts/src/convert-pack.ts\` on ${opts.generatedAt}. ` +
          "Status: **raw conversion, unlisted**, pending designer polish and Ash's sign-off.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Kinds: ${conversions.length}; pages: ${all.length}.`);
  lines.push(`- Mean pixel match against the pack: ${pct(mean)} over ${scores.length} renders.`);
  if (opts.rendererNote) lines.push(`- ${opts.rendererNote}`);
  lines.push(
    `- Motion: ${
      Object.keys(motion).length
        ? Object.entries(motion)
            .map(([k, v]) => `\`${k}\` → ${v}`)
            .join("; ")
        : "none in the pack"
    }.`,
  );
  const untokenised = new Set(
    all.flatMap((p) => p.untokenised.map((u) => u.replace(/ \(element \d+\)$/, ""))),
  );
  lines.push(`- Colours that move with the palette but aren't a token: ${untokenised.size}.`);
  if (opts.results === null || opts.results === undefined)
    lines.push("- Results set vs Match Summary: not compared (no captures of both).");
  else if (opts.results.same)
    lines.push("- Results set vs Match Summary: the same layout apart from the performers block.");
  else
    lines.push(
      `- Results set vs Match Summary: **they differ** beyond the performers block, so \`results\` may need a kind of its own (architect §1): ${opts.results.differences.join("; ")}.`,
    );
  if (opts.validation === null || opts.validation === undefined)
    lines.push("- Validation: pending (the template validator reads format v2 from L1-B).");
  else {
    const bad = Object.entries(opts.validation).filter(([, e]) => e.length);
    lines.push(
      bad.length
        ? `- Validation: **${bad.reduce((n, [, e]) => n + e.length, 0)} errors** in ${bad.map(([k, e]) => `${k} (${e.slice(0, 3).join("; ")})`).join(", ")}.`
        : "- Validation: every document passes the template validator.",
    );
  }
  lines.push(
    polished
      ? `- Polish time logged: ${polished.halfDays ?? "not logged"} hd.`
      : "- Polish time logged: 0 hd (raw conversion).",
  );
  lines.push("");

  for (const conv of conversions) {
    lines.push(`## ${conv.kind}`);
    lines.push("");
    for (const page of conv.pages) {
      const key = checkKey(page.kind, page.page);
      lines.push(`### ${page.page}`);
      lines.push("");
      lines.push(
        `- From \`${page.source}\`${page.alternatives.length ? `; not used: ${page.alternatives.map((a) => `\`${a}\``).join(", ")}` : ""}.`,
      );
      lines.push(
        `- Layers: ${Object.entries(page.layers)
          .map(([k, n]) => `${n} ${k}`)
          .join(", ")}${page.stacks ? `; ${page.stacks} stack group(s)` : ""}.`,
      );
      if (page.unknownTokens.length)
        lines.push(
          `- Tokens outside the page's catalogue (won't bind): ${page.unknownTokens.map((t) => `\`${t}\``).join(", ")}.`,
        );
      if (Object.keys(page.motion).length)
        lines.push(
          `- Motion: ${Object.entries(page.motion)
            .map(([k, v]) => `\`${k}\` → ${v}`)
            .join("; ")}.`,
        );
      lines.push("");
      lines.push("| Size | Pixel match | Fit warnings |");
      lines.push("| --- | --- | --- |");
      for (const size of page.sizes) {
        const c = checks[key]?.[size];
        const fit = c?.error
          ? `error: ${c.error}`
          : c?.warnings
            ? c.warnings.length
              ? c.warnings.join("; ")
              : "none"
            : "not run";
        lines.push(`| ${size} | ${pct(c?.pixelMatch)} | ${fit} |`);
      }
      lines.push("");
      if (page.polish.length) {
        lines.push(polished ? "Converter notes (from the raw conversion):" : "Polish:");
        lines.push("");
        for (const p of page.polish) lines.push(`- ${p}`);
        lines.push("");
      }
      if (page.untokenised.length) {
        lines.push("Colours not tokenised:");
        lines.push("");
        for (const u of [
          ...new Set(page.untokenised.map((x) => x.replace(/ \(element \d+\)$/, ""))),
        ])
          lines.push(`- ${u}`);
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}
