/**
 * Structured-output spike for the social template library (EM plan
 * "Spike", S.1–S.3; decision in docs/plans/2026-10-21-template-schema-spike.md).
 *
 * Question: can claude-opus-5-5 take the template format's JSON Schema as
 * `output_config.format` with nested stack groups, and does it produce valid
 * documents more often than a schema-in-the-prompt loop?
 *
 *   pnpm --filter @workspace/scripts run spike-template-schema offline
 *   pnpm --filter @workspace/scripts run spike-template-schema compile --env-file <path>
 *   pnpm --filter @workspace/scripts run spike-template-schema quality --env-file <path>
 *   pnpm --filter @workspace/scripts run spike-template-schema report
 *
 * `--env-file` names a dotenv-style file holding ANTHROPIC_API_KEY (the local
 * dev stack's env.local); the key is read from it, or from the environment,
 * and is never printed. Every call is priced from its usage into a ledger,
 * and a call is only sent when its worst case fits under `--cap` (default
 * US$20, Ash's approval). Results land in scripts/exports/template-schema-spike/
 * (git-ignored).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { KINDS, kindPages } from "./spike-template-schema/format";
import {
  formatGuide,
  kindCatalogueText,
  outputNote,
  retryTurn,
  userTurn,
} from "./spike-template-schema/prompt";
import {
  buildSchema,
  fromFaithful,
  fromStrict,
  schemaStats,
  toWire,
  type Encoding,
  type Nesting,
  type Schema,
  type Scope,
} from "./spike-template-schema/shapes";
import { validateV2, type Verdict } from "./spike-template-schema/validate";

const MODEL = "claude-opus-5-5";
const BETAS = ["server-side-fallback-2026-07-01"];
/** US$ per million tokens: Opus 5.5, and a ceiling for any fallback model. */
const PRICES: Record<string, { input: number; output: number; write: number; read: number }> = {
  [MODEL]: { input: 4, output: 20, write: 5, read: 0.2 },
  fallback: { input: 5, output: 25, write: 6.25, read: 0.5 },
};
const PROBE_MAX_TOKENS = 64;
const GENERATE_MAX_TOKENS = 64000;
const MAX_RETRIES = 2;

const OUT = new URL("../exports/template-schema-spike/", import.meta.url);
const outPath = (name: string) => new URL(name, OUT);

// ── arguments ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const command = argv[0] ?? "offline";
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const CAP_USD = Number(flag("cap") ?? 20);
const ONLY_KINDS = flag("kinds")?.split(",");
const ONLY_BRIEFS = flag("briefs")?.split(",");
const ONLY_SHAPES = flag("shapes")?.split(",");
/** A repeat sample of the same briefs (`--round 2`). */
const ROUND = Number(flag("round") ?? 1);
const CONCURRENCY = Number(flag("concurrency") ?? 3);

function apiKey(): string {
  const file = flag("env-file");
  if (file) {
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("ANTHROPIC_API_KEY="));
    const key = line?.slice("ANTHROPIC_API_KEY=".length).trim();
    if (key) return key;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("No ANTHROPIC_API_KEY: pass --env-file or set it in the environment.");
  return key;
}

// ── ledger ───────────────────────────────────────────────────────────────

type Usage = Anthropic.Beta.BetaUsage;
type LedgerEntry = { at: string; label: string; costUsd: number; usage: unknown };
type Ledger = { spentUsd: number; calls: LedgerEntry[] };

function readJson<T>(name: string, fallback: T): T {
  const p = outPath(name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
}
function writeJson(name: string, value: unknown): void {
  const p = outPath(name);
  mkdirSync(new URL(".", p), { recursive: true });
  writeFileSync(p, JSON.stringify(value, null, 2));
}

const ledger: Ledger = readJson("ledger.json", { spentUsd: 0, calls: [] });
let reservedUsd = 0;

function priceOf(model: string) {
  return PRICES[model] ?? PRICES.fallback!;
}

/** A call's cost from its usage, priced per iteration when a fallback model served part of it. */
function costOf(usage: Usage): number {
  const tally = (
    model: string,
    u: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    },
  ) => {
    const p = priceOf(model);
    return (
      (u.input_tokens * p.input +
        u.output_tokens * p.output +
        (u.cache_creation_input_tokens ?? 0) * p.write +
        (u.cache_read_input_tokens ?? 0) * p.read) /
      1e6
    );
  };
  const iterations = usage.iterations ?? [];
  if (iterations.length === 0) return tally(MODEL, usage);
  return iterations.reduce((sum, it) => {
    if (it.type === "fallback_message") return sum + tally(it.model, it);
    if (it.type === "message") return sum + tally(MODEL, it);
    return sum;
  }, 0);
}

/** Reserve a call's worst case, or refuse it when it would pass the cap. */
function reserve(label: string, inputChars: number, maxTokens: number): number {
  const p = PRICES.fallback!;
  const worst = ((inputChars / 3) * p.write + maxTokens * p.output) / 1e6;
  if (ledger.spentUsd + reservedUsd + worst > CAP_USD) {
    throw new CapReached(
      `${label}: worst case $${worst.toFixed(2)} would pass the $${CAP_USD} cap (spent $${ledger.spentUsd.toFixed(2)}, reserved $${reservedUsd.toFixed(2)}).`,
    );
  }
  reservedUsd += worst;
  return worst;
}
class CapReached extends Error {}

function settle(label: string, reservation: number, usage: Usage | null): number {
  reservedUsd -= reservation;
  const costUsd = usage ? costOf(usage) : 0;
  ledger.spentUsd += costUsd;
  ledger.calls.push({ at: new Date().toISOString(), label, costUsd, usage });
  writeJson("ledger.json", ledger);
  return costUsd;
}

// ── requests ─────────────────────────────────────────────────────────────

let client: Anthropic | null = null;
function api(): Anthropic {
  client ??= new Anthropic({ apiKey: apiKey(), maxRetries: 2, timeout: 20 * 60 * 1000 });
  return client;
}

type CallResult = {
  ok: boolean;
  status?: number;
  error?: string;
  message?: Anthropic.Beta.BetaMessage;
  firstEventMs?: number;
  totalMs: number;
  costUsd: number;
};

async function call(
  label: string,
  params: BetaMessageStreamParams,
  inputChars: number,
): Promise<CallResult> {
  const reservation = reserve(label, inputChars, params.max_tokens);
  const t0 = performance.now();
  let firstEventMs: number | undefined;
  try {
    const stream = api().beta.messages.stream(params);
    stream.on("streamEvent", () => {
      firstEventMs ??= performance.now() - t0;
    });
    const message = await stream.finalMessage();
    const costUsd = settle(label, reservation, message.usage);
    return { ok: true, message, firstEventMs, totalMs: performance.now() - t0, costUsd };
  } catch (err) {
    settle(label, reservation, null);
    if (err instanceof Anthropic.APIError) {
      return {
        ok: false,
        status: err.status,
        error: JSON.stringify(err.error ?? err.message),
        totalMs: performance.now() - t0,
        costUsd: 0,
      };
    }
    throw err;
  }
}

/** Run `tasks` with at most `limit` at once, stopping new work once the cap is reached. */
async function pool<T>(limit: number, tasks: Array<() => Promise<T>>): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < tasks.length) {
      const i = next++;
      try {
        results[i] = await tasks[i]!();
      } catch (err) {
        if (err instanceof CapReached) {
          console.warn(err.message);
          stopped = true;
        } else throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results.filter((r) => r !== undefined);
}

// ── S.1: offline ─────────────────────────────────────────────────────────

type Variant = { shape: "a" | "b"; encoding: Encoding; scope: Scope };
const nestingOf = (shape: "a" | "b"): Nesting => (shape === "a" ? "nested" : "flat");
const variantLabel = (v: Variant) => `${v.shape}-${v.encoding}-${v.scope}`;

function variants(): Variant[] {
  const out: Variant[] = [];
  for (const shape of ["a", "b"] as const)
    for (const encoding of ["faithful", "strict"] as const) {
      out.push({ shape, encoding, scope: "whole" });
      for (const kind of KINDS) out.push({ shape, encoding, scope: kind });
    }
  return out;
}

function offline(): void {
  const rows = variants().map((v) => {
    const schema = buildSchema(v.encoding, nestingOf(v.shape), v.scope);
    writeJson(`schemas/${variantLabel(v)}.json`, toWire(schema));
    return { ...v, ...schemaStats(schema) };
  });
  writeJson("offline.json", rows);
  const pick = (shape: string, encoding: string) =>
    rows.filter((r) => r.shape === shape && r.encoding === encoding);
  console.log(
    "| shape | encoding | scope | bytes | $defs | $ref | anyOf | optional | union props | refs to unions | enums | stripped (spike) | stripped (SDK transform) |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const shape of ["a", "b"])
    for (const encoding of ["faithful", "strict"]) {
      const group = pick(shape, encoding);
      const whole = group.find((r) => r.scope === "whole")!;
      const kinds = group.filter((r) => r.scope !== "whole");
      const range = (f: (r: (typeof rows)[number]) => number) =>
        `${Math.min(...kinds.map(f))}–${Math.max(...kinds.map(f))}`;
      const fmt = (o: Record<string, number>) =>
        Object.entries(o)
          .map(([k, n]) => `${k} ${n}`)
          .join(", ");
      console.log(
        `| ${shape} | ${encoding} | whole | ${whole.bytes} | ${whole.defs} | ${whole.refs} | ${whole.anyOf} | ${whole.optionalProperties} | ${whole.unionProperties} | ${whole.refsToUnions} | ${whole.enums} | ${fmt(whole.strippedBySpike)} | ${fmt(whole.strippedBySdk)} |`,
      );
      console.log(
        `| ${shape} | ${encoding} | per kind (${kinds.length}) | ${range((r) => r.bytes)} | ${range((r) => r.defs)} | ${range((r) => r.refs)} | ${range((r) => r.anyOf)} | ${range((r) => r.optionalProperties)} | ${range((r) => r.unionProperties)} | ${range((r) => r.refsToUnions)} | ${range((r) => r.enums)} | | |`,
      );
      const loose = group.filter((r) => r.objectsWithoutAdditionalPropertiesFalse > 0);
      if (loose.length)
        console.log(`  ! ${loose.length} schemas have objects without additionalProperties: false`);
    }
}

// ── S.2: compile ─────────────────────────────────────────────────────────

type CompileRow = Variant & {
  accepted: boolean;
  status?: number;
  error?: string;
  firstMs?: number;
  firstEventMs?: number;
  cachedMs?: number;
  cachedEventMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
};

type Probe = Omit<CompileRow, keyof Variant>;

/** Send `schema` as the output format, twice when it compiles (the second call hits the grammar cache). */
async function probeSchema(label: string, schema: Schema, kind: string): Promise<Probe> {
  const params: BetaMessageStreamParams = {
    model: MODEL,
    max_tokens: PROBE_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    betas: BETAS,
    fallbacks: "default",
    messages: [{ role: "user", content: `Return a minimal ${kind} template.` }],
  };
  const chars = JSON.stringify(schema).length;
  const first = await call(`compile ${label}`, params, chars);
  const row: Probe = {
    accepted: first.ok,
    status: first.status,
    error: first.error,
    firstMs: Math.round(first.totalMs),
    firstEventMs: first.firstEventMs && Math.round(first.firstEventMs),
    inputTokens: first.message?.usage.input_tokens,
    outputTokens: first.message?.usage.output_tokens,
    costUsd: first.costUsd,
  };
  if (first.ok) {
    // The same schema again: its grammar is now cached, so the difference is the compile.
    const again = await call(`compile-cached ${label}`, params, chars);
    row.cachedMs = Math.round(again.totalMs);
    row.cachedEventMs = again.firstEventMs && Math.round(again.firstEventMs);
    row.costUsd += again.costUsd;
  }
  console.log(
    `${label}: ${row.accepted ? `accepted, ${row.firstMs} ms first / ${row.cachedMs} ms cached` : `${row.status} ${row.error?.slice(0, 200)}`}`,
  );
  return row;
}

async function compileOne(v: Variant): Promise<CompileRow> {
  const schema = toWire(buildSchema(v.encoding, nestingOf(v.shape), v.scope)) as Schema;
  const kind = v.scope === "whole" ? "milestone" : v.scope;
  return { ...v, ...(await probeSchema(variantLabel(v), schema, kind)) };
}

/**
 * Where the grammar limit sits: the smallest strict schema (milestone, one
 * page, no lists) with parts removed one step at a time, flat and nested.
 */
const BISECT_STEPS: Array<{ label: string; apply: (defs: Record<string, Schema>) => void }> = [
  { label: "full", apply: () => {} },
  { label: "no id pattern", apply: (defs) => forEachLayer(defs, (l) => dropPatterns(l)) },
  {
    label: "style props only",
    apply: (defs) => {
      const style = defs.Style as { properties: Record<string, Schema> };
      defs.Style = {
        type: "object",
        properties: { props: style.properties.props! },
        required: ["props"],
        additionalProperties: false,
      };
    },
  },
  {
    label: "no motion, showWhen, fit, stack",
    apply: (defs) =>
      forEachLayer(defs, (l) => dropProps(l, ["motion", "showWhen", "fit", "stack"])),
  },
  {
    label: "no name, hidden, bind, svg",
    apply: (defs) => forEachLayer(defs, (l) => dropProps(l, ["name", "hidden", "bind", "svg"])),
  },
  { label: "no style", apply: (defs) => forEachLayer(defs, (l) => dropProps(l, ["style"])) },
];

function forEachLayer(defs: Record<string, Schema>, f: (layer: Schema) => void): void {
  for (const [name, def] of Object.entries(defs)) if (name.startsWith("Layer_")) f(def);
}
function dropProps(layer: Schema, names: string[]): void {
  const props = layer.properties as Record<string, Schema>;
  for (const n of names) delete props[n];
  layer.required = (layer.required as string[]).filter((r) => !names.includes(r));
}
function dropPatterns(layer: Schema): void {
  for (const prop of Object.values(layer.properties as Record<string, Schema>)) delete prop.pattern;
}

async function bisect(): Promise<void> {
  const rows: Array<{ nesting: Nesting; step: string; bytes: number } & Probe> = [];
  for (const nesting of ["flat", "nested"] as const) {
    const schema = buildSchema("strict", nesting, "milestone");
    const defs = schema.$defs as Record<string, Schema>;
    for (const step of BISECT_STEPS) {
      step.apply(defs);
      const wire = toWire(schema) as Schema;
      const probe = await probeSchema(`bisect ${nesting} ${step.label}`, wire, "milestone");
      rows.push({ nesting, step: step.label, bytes: JSON.stringify(wire).length, ...probe });
    }
  }
  writeJson("bisect.json", rows);
  console.log(`Spent so far: ${ledger.spentUsd.toFixed(4)}`);
}

async function compile(): Promise<void> {
  const existing = readJson<CompileRow[]>("compile.json", []);
  const done = new Set(existing.map(variantLabel));
  const todo = variants().filter(
    (v) =>
      !done.has(variantLabel(v)) &&
      (!ONLY_KINDS || ONLY_KINDS.includes(v.scope)) &&
      (!ONLY_SHAPES || ONLY_SHAPES.includes(`${v.shape}-${v.encoding}`)),
  );
  const rows = await pool(
    CONCURRENCY,
    todo.map((v) => () => compileOne(v)),
  );
  writeJson("compile.json", [...existing, ...rows]);
  console.log(`Spent so far: $${ledger.spentUsd.toFixed(4)}`);
}

// ── S.3: quality ─────────────────────────────────────────────────────────

const BRIEFS: Array<{ id: string; kind: string; brief: string }> = [
  {
    id: "match-day",
    kind: "matchDay",
    brief:
      "A broadcast-style match day carousel. Fixture page: both crests facing off around a big VS, grade and round, venue, date and start time, with the last-meeting line only when it's known. Title page: the weekend title over the ground photo. Day page: the day's junior matches as a list. Sponsors page: thank the sponsors with their logos in a grid. Dark navy stage, the club's accent colour as angled slashes, condensed type.",
  },
  {
    id: "ladder",
    kind: "ladder",
    brief:
      "A clean, light ladder card: competition and grade in a header, then the table with position, team, played, won, lost and points. The club's own row is highlighted in its accent colour. An 'as of' line under the table. Rows should breathe, and the story size should show more of them.",
  },
  {
    id: "milestone",
    kind: "milestone",
    brief:
      "A premium gold-foil milestone card. The milestone number huge, filled with a gold gradient, with a shine loop. The player photo cut out on the right; on junior cards, or when there's no photo, the club crest large instead. Name, tier label and milestone label in a stacked block that collapses when the tier label is missing. Black stage with subtle grain.",
  },
  {
    id: "team-list",
    kind: "teamList",
    brief:
      "This round's team list. A header stack with grade heading, opponent, venue and date/time that collapses when any of them is missing. The XI as a two-column list with shirt number, name and role, debutants marked. The squad photo behind a dark fade. Up to three sponsor logos along the bottom.",
  },
  {
    id: "match-summary",
    kind: "matchSummary",
    brief:
      "A result card: the result line large, then each team as a block (crest, name, score and overs in a row, top performers under it) built from nested stacks so a missing performer line closes up. Then a day page listing the day's other results. Sunset look: a warm gradient background and white type.",
  },
];

type ShapeKey = "a-strict" | "b-strict" | "a-faithful" | "b-faithful" | "c";

type Attempt = {
  valid: boolean;
  errors: string[];
  stopReason: string | null;
  fellBack: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  totalMs: number;
  apiError?: string;
};
type QualityRow = {
  brief: string;
  round?: number;
  kind: string;
  shape: ShapeKey;
  attempts: Attempt[];
  firstTryValid: boolean;
  finalValid: boolean;
  outcome: "valid" | "invalid" | "refused" | "api-error";
  layers: number;
  maxDepth: number;
  stacks: number;
  costUsd: number;
  /** Attempts after the first valid one, dropped by `rescore` (retries a scoring bug caused). */
  droppedAttempts?: number;
  droppedCostUsd?: number;
};

function parseJson(text: string): { value?: unknown; error?: string } {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) return { error: "The reply holds no JSON object." };
  try {
    return { value: JSON.parse(trimmed.slice(start, end + 1)) };
  } catch (err) {
    return { error: `The reply isn't valid JSON: ${(err as Error).message.slice(0, 120)}` };
  }
}

/** Score one reply: parse it, convert it from its shape's encoding, validate it. */
function scoreReply(
  text: string,
  shape: ShapeKey,
  kind: string,
): { errors: string[]; doc?: unknown; verdict?: Verdict } {
  const [shapeLetter, encoding] = shape.split("-") as ["a" | "b" | "c", Encoding | undefined];
  const parsed = parseJson(text);
  if (parsed.error) return { errors: [parsed.error] };
  const converted =
    shapeLetter === "c" || !encoding
      ? { doc: parsed.value, errors: [] }
      : encoding === "strict"
        ? fromStrict(parsed.value, nestingOf(shapeLetter))
        : fromFaithful(parsed.value, nestingOf(shapeLetter));
  const verdict = validateV2(converted.doc, kind);
  return { errors: [...converted.errors, ...verdict.errors], doc: converted.doc, verdict };
}

async function generate(b: (typeof BRIEFS)[number], shape: ShapeKey): Promise<QualityRow> {
  const tag = ROUND > 1 ? `${b.id}~${ROUND}` : b.id;
  const [shapeLetter, encodingName] = shape.split("-") as ["a" | "b" | "c", Encoding | undefined];
  const encoding = encodingName ?? null;
  const schema =
    shapeLetter === "c" || !encoding
      ? null
      : (toWire(buildSchema(encoding, nestingOf(shapeLetter), b.kind)) as Schema);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: formatGuide() },
    { type: "text", text: kindCatalogueText(b.kind) },
    { type: "text", text: outputNote(shapeLetter, encoding) },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: userTurn(b.kind, b.brief) },
  ];
  const row: QualityRow = {
    brief: b.id,
    round: ROUND,
    kind: b.kind,
    shape,
    attempts: [],
    firstTryValid: false,
    finalValid: false,
    outcome: "invalid",
    layers: 0,
    maxDepth: 0,
    stacks: 0,
    costUsd: 0,
  };
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const params: BetaMessageStreamParams = {
      model: MODEL,
      max_tokens: GENERATE_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        ...(schema ? { format: { type: "json_schema" as const, schema } } : {}),
      },
      betas: BETAS,
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system,
      messages,
    };
    const chars = JSON.stringify({ system, messages, schema }).length;
    const res = await call(`quality ${tag} ${shape} #${attempt + 1}`, params, chars);
    const usage = res.message?.usage;
    const entry: Attempt = {
      valid: false,
      errors: [],
      stopReason: res.message?.stop_reason ?? null,
      fellBack: (usage?.iterations ?? []).some((it) => it.type === "fallback_message"),
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
      costUsd: res.costUsd,
      totalMs: Math.round(res.totalMs),
      apiError: res.ok ? undefined : `${res.status} ${res.error}`,
    };
    row.attempts.push(entry);
    row.costUsd += res.costUsd;
    if (!res.ok || !res.message) {
      row.outcome = "api-error";
      break;
    }
    if (res.message.stop_reason === "refusal") {
      row.outcome = "refused";
      break;
    }
    const text = res.message.content
      .filter((c): c is Anthropic.Beta.BetaTextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    writeJson(
      `outputs/${tag}.${shape}.${attempt + 1}.json`,
      parseJson(text).value ?? { raw: text },
    );
    const scored = scoreReply(text, shape, b.kind);
    const errors = scored.errors;
    if (scored.verdict) {
      const { layers, maxDepth, stacks } = scored.verdict;
      Object.assign(row, { layers, maxDepth, stacks });
      writeJson(`outputs/${tag}.${shape}.${attempt + 1}.v2.json`, scored.doc);
    }
    if (res.message.stop_reason === "max_tokens")
      errors.unshift("The reply was cut off at max_tokens.");
    entry.errors = errors;
    entry.valid = errors.length === 0;
    if (attempt === 0) row.firstTryValid = entry.valid;
    console.log(
      `${tag} ${shape} #${attempt + 1}: ${entry.valid ? "valid" : `${errors.length} errors`} · ${entry.outputTokens} out · $${entry.costUsd.toFixed(3)} · ${Math.round(entry.totalMs / 1000)} s`,
    );
    if (entry.valid) {
      row.finalValid = true;
      row.outcome = "valid";
      break;
    }
    messages.push({
      role: "assistant",
      content: res.message.content as Anthropic.Beta.BetaContentBlockParam[],
    });
    messages.push({ role: "user", content: retryTurn(errors) });
  }
  return row;
}

async function quality(): Promise<void> {
  const compiled = readJson<CompileRow[]>("compile.json", []);
  const compiles = (shape: "a" | "b", encoding: Encoding) => {
    const rows = compiled.filter(
      (r) => r.shape === shape && r.encoding === encoding && r.scope !== "whole",
    );
    return rows.length > 0 && rows.every((r) => r.accepted);
  };
  const shapes: ShapeKey[] = [];
  for (const shape of ["a", "b"] as const)
    for (const encoding of ["faithful", "strict"] as const)
      if (compiles(shape, encoding)) shapes.push(`${shape}-${encoding}`);
  shapes.push("c");
  const chosen = shapes.filter((s) => !ONLY_SHAPES || ONLY_SHAPES.includes(s));
  console.log(`Shapes in the probe: ${chosen.join(", ")}`);
  const existing = readJson<QualityRow[]>("quality.json", []);
  const done = new Set(existing.map((r) => `${r.brief}/${r.shape}/${r.round ?? 1}`));
  const tasks = BRIEFS.filter((b) => !ONLY_BRIEFS || ONLY_BRIEFS.includes(b.id)).flatMap((b) =>
    chosen.filter((s) => !done.has(`${b.id}/${s}/${ROUND}`)).map((s) => () => generate(b, s)),
  );
  const rows = await pool(CONCURRENCY, tasks);
  writeJson("quality.json", [...existing, ...rows]);
  console.log(`Spent so far: $${ledger.spentUsd.toFixed(4)}`);
}

/**
 * Re-validate the saved replies (after a fix to the spike's validator or
 * catalogues), keeping each row's attempts up to its first valid one. The
 * dropped attempts' spend stays in the ledger and is reported.
 */
function rescore(): void {
  const rows = readJson<QualityRow[]>("quality.json", []);
  for (const row of rows) {
    const tag = (row.round ?? 1) > 1 ? `${row.brief}~${row.round}` : row.brief;
    const kept: Attempt[] = [];
    for (const [i, attempt] of row.attempts.entries()) {
      kept.push(attempt);
      if (attempt.apiError || attempt.stopReason === "refusal") break;
      const saved = readJson<unknown>(`outputs/${tag}.${row.shape}.${i + 1}.json`, null);
      const raw = (saved as { raw?: unknown } | null)?.raw;
      const scored = scoreReply(
        typeof raw === "string" ? raw : JSON.stringify(saved),
        row.shape,
        row.kind,
      );
      attempt.errors =
        attempt.stopReason === "max_tokens"
          ? ["The reply was cut off at max_tokens.", ...scored.errors]
          : scored.errors;
      attempt.valid = attempt.errors.length === 0;
      if (scored.verdict) {
        const { layers, maxDepth, stacks } = scored.verdict;
        Object.assign(row, { layers, maxDepth, stacks });
      }
      if (attempt.valid) break;
    }
    const dropped = row.attempts.slice(kept.length);
    row.droppedAttempts = (row.droppedAttempts ?? 0) + dropped.length;
    row.droppedCostUsd = (row.droppedCostUsd ?? 0) + dropped.reduce((n, a) => n + a.costUsd, 0);
    row.attempts = kept;
    row.costUsd = kept.reduce((n, a) => n + a.costUsd, 0);
    row.firstTryValid = kept[0]?.valid ?? false;
    row.finalValid = kept.at(-1)?.valid ?? false;
    if (row.outcome === "valid" || row.outcome === "invalid")
      row.outcome = row.finalValid ? "valid" : "invalid";
  }
  writeJson("quality.json", rows);
  report();
}

// ── report ───────────────────────────────────────────────────────────────

function report(): void {
  const compiled = readJson<CompileRow[]>("compile.json", []);
  const rows = readJson<QualityRow[]>("quality.json", []);
  console.log(`## Compile (S.2)\n`);
  console.log("| shape | encoding | scope | result | first call (ms) | cached call (ms) | error |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of compiled)
    console.log(
      `| ${r.shape} | ${r.encoding} | ${r.scope} | ${r.accepted ? "accepted" : r.status} | ${r.firstMs ?? ""} | ${r.cachedMs ?? ""} | ${(r.error ?? "").replace(/\|/g, "/").slice(0, 160)} |`,
    );
  console.log(`\n## Quality (S.3)\n`);
  console.log(
    "| brief | shape | first try | after retries | attempts | layers | depth | stacks | output tokens | cost |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows)
    console.log(
      `| ${r.brief}${(r.round ?? 1) > 1 ? ` (round ${r.round})` : ""} | ${r.shape} | ${r.firstTryValid ? "valid" : `${r.attempts[0]?.errors.length ?? "?"} errors`} | ${r.outcome} | ${r.attempts.length} | ${r.layers} | ${r.maxDepth} | ${r.stacks} | ${r.attempts.map((a) => a.outputTokens).join(" + ")} | $${r.costUsd.toFixed(3)} |`,
    );
  const byShape = new Map<string, QualityRow[]>();
  for (const r of rows) byShape.set(r.shape, [...(byShape.get(r.shape) ?? []), r]);
  console.log(
    "\n| shape | first-try valid | valid within 2 retries | mean cost | mean output tokens (first try) |",
  );
  console.log("| --- | --- | --- | --- | --- |");
  for (const [shape, group] of byShape) {
    const n = group.length;
    const first = group.filter((r) => r.firstTryValid).length;
    const final = group.filter((r) => r.finalValid).length;
    const cost = group.reduce((s, r) => s + r.costUsd, 0) / n;
    const out = group.reduce((s, r) => s + (r.attempts[0]?.outputTokens ?? 0), 0) / n;
    console.log(
      `| ${shape} | ${first}/${n} | ${final}/${n} | $${cost.toFixed(3)} | ${Math.round(out)} |`,
    );
  }
  console.log(`\nTotal spend: $${ledger.spentUsd.toFixed(4)} over ${ledger.calls.length} calls.`);
  console.log(
    `Pages per brief kind: ${BRIEFS.map((b) => `${b.kind} ${kindPages(b.kind).length}`).join(", ")}.`,
  );
}

const commands: Record<string, () => void | Promise<void>> = {
  offline,
  compile,
  bisect,
  quality,
  rescore,
  report,
};
const run = commands[command];
if (!run) {
  console.error(`Unknown command "${command}". Use offline, compile, quality or report.`);
  process.exit(1);
}
await run();
