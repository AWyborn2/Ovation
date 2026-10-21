/**
 * Fit-check Ovation's template bundles in a real browser (ADR-011 §4, L2-B,
 * T2.8): build the web app, serve the render harness, and run its `fitCheck`
 * on each bundle template (every page × size × preset × photo and sponsor
 * variant, with worst-case content). Writes a report and exits non-zero when
 * any template fails.
 *
 *   pnpm --filter @workspace/scripts run check-template-bundles
 *     [--changed-since=<git ref>]  only bundles changed since the ref, or all of
 *                                  them when the renderer or format changed
 *     [--starters]                 also check the TypeScript starters (local review)
 *     [--only=<look/kind,...>]     just these templates
 *     [--base-url=<url>]           a running web app instead of building one
 *     [--skip-build]               reuse the last build
 *     [--out=<dir>]                default scripts/exports/template-bundles
 *
 * Chrome: `CHROME_PATH` (CI), else an installed Chrome or Edge (`harness-browser.ts`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fitReportSummary,
  STARTER_IDS,
  starterDocument,
  TEMPLATE_CARD_KINDS,
  type TemplateFitReport,
} from "@workspace/scorecard/kind-templates";
import { REPO_ROOT, callHarness, withHarness } from "./lib/harness-browser";
import {
  gateFailures,
  readBundleTargets,
  renderReport,
  selectChanged,
  type CheckedTemplate,
  type FitTarget,
  type KnownFailures,
} from "./check-template-bundles-core";

/** Listed bundles known to fail today, with why; polish takes them off. */
const KNOWN_FAILURES = path.join(
  REPO_ROOT,
  "scripts",
  "src",
  "check-template-bundles.known-failures.json",
);

export function readKnownFailures(file = KNOWN_FAILURES): KnownFailures {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as KnownFailures) : {};
}

export interface CheckOptions {
  changedSince: string | null;
  starters: boolean;
  only: string[] | null;
  baseUrl: string | null;
  skipBuild: boolean;
  out: string;
}

export function parseArgs(argv: readonly string[]): CheckOptions {
  const args = new Map<string, string>();
  for (const a of argv) {
    if (a === "--") continue;
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`Unknown argument: ${a}`);
    args.set(m[1]!, m[2] ?? "true");
  }
  const known = ["changed-since", "starters", "only", "base-url", "skip-build", "out"];
  for (const key of args.keys())
    if (!known.includes(key)) throw new Error(`Unknown option --${key}`);
  const only = args.get("only");
  return {
    changedSince: args.get("changed-since") ?? null,
    starters: args.get("starters") === "true",
    only: only
      ? only
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    baseUrl: args.get("base-url") ?? null,
    skipBuild: args.get("skip-build") === "true",
    out: args.get("out") ?? path.join(REPO_ROOT, "scripts", "exports", "template-bundles"),
  };
}

/** Files changed between `ref` and HEAD. */
function changedFiles(ref: string): string[] {
  const out = execFileSync("git", ["diff", "--name-only", `${ref}...HEAD`], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

/** The TypeScript starters as check targets (until L4-B exports them as bundles). */
function starterTargets(): FitTarget[] {
  const out: FitTarget[] = [];
  for (const starter of STARTER_IDS)
    for (const kind of TEMPLATE_CARD_KINDS) {
      const document = starterDocument(starter, kind);
      if (document) out.push({ id: `starter:${starter}/${kind}`, kind, document });
    }
  return out;
}

export async function checkTemplateBundles(opts: CheckOptions): Promise<CheckedTemplate[]> {
  const bundles = readBundleTargets(REPO_ROOT);
  let targets = opts.changedSince
    ? selectChanged(bundles, changedFiles(opts.changedSince))
    : bundles;
  if (opts.starters) targets = [...targets, ...starterTargets()];
  if (opts.only) targets = targets.filter((t) => opts.only!.includes(t.id));
  const selection = [
    opts.changedSince ? `changed since ${opts.changedSince}` : "every bundle",
    ...(opts.starters ? ["and the starters"] : []),
    ...(opts.only ? [`only ${opts.only.join(", ")}`] : []),
  ].join(" ");
  process.stderr.write(
    `[fit] ${targets.length} of ${bundles.length} bundle templates (${selection})\n`,
  );

  const checked: CheckedTemplate[] = [];
  if (targets.length > 0) {
    await withHarness(
      { baseUrl: opts.baseUrl ?? undefined, skipBuild: opts.skipBuild, require: ["fitCheck"] },
      async (session) => {
        const page = await session.openPage();
        for (const target of targets) {
          const started = Date.now();
          try {
            const report = await callHarness<TemplateFitReport>(page, "fitCheck", {
              document: target.document,
              kind: target.kind,
            });
            checked.push({ target, report });
            process.stderr.write(
              `[fit] ${target.id}: ${fitReportSummary(report)} (${Date.now() - started} ms)\n`,
            );
          } catch (err) {
            checked.push({ target, report: null, error: String(err).slice(0, 300) });
            process.stderr.write(`[fit] ${target.id}: error ${String(err).slice(0, 300)}\n`);
          }
        }
        if (session.errors.length > 0)
          process.stderr.write(`[fit] page errors:\n  ${session.errors.join("\n  ")}\n`);
      },
    );
  }

  mkdirSync(opts.out, { recursive: true });
  writeFileSync(
    path.join(opts.out, "report.md"),
    renderReport(checked, { selection, known: readKnownFailures() }),
  );
  writeFileSync(
    path.join(opts.out, "report.json"),
    `${JSON.stringify(
      checked.map((c) => ({
        id: c.target.id,
        hash: c.target.hash,
        report: c.report,
        error: c.error,
      })),
      null,
      2,
    )}\n`,
  );
  process.stderr.write(
    `[fit] report: ${path.relative(REPO_ROOT, path.join(opts.out, "report.md"))}\n`,
  );
  return checked;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkTemplateBundles(parseArgs(process.argv.slice(2))).then(
    (checked) => {
      const gate = gateFailures(checked, readKnownFailures());
      const failed = gate.blocking.length + gate.known.length + gate.unlisted.length;
      process.stderr.write(
        `[fit] ${checked.length - failed} passed, ${failed} failed: ${gate.blocking.length} blocking, ` +
          `${gate.known.length} known, ${gate.unlisted.length} unlisted\n`,
      );
      for (const c of gate.blocking) process.stderr.write(`[fit] blocking: ${c.target.id}\n`);
      if (gate.nowPassing.length)
        process.stderr.write(
          `[fit] now passing, take off the known-failures list: ${gate.nowPassing.join(", ")}\n`,
        );
      process.exit(gate.blocking.length > 0 ? 1 : 0);
    },
    (err) => {
      process.stderr.write(`[fit] ${String(err instanceof Error ? err.stack : err)}\n`);
      process.exit(2);
    },
  );
}
