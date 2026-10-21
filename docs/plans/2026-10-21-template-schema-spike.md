# Template schema spike (S.1–S.4): structured outputs vs schema-in-prompt

Status: DECIDED 21 Oct 2026. Shape **(c)**: no structured output; the format rules go in the
prompt and `validate.ts` drives the retries.

Plan: `.10x/decisions/engineering-manager/social-template-library.md` ("Spike").
Design: ADR-011, `.10x/decisions/architect/social-template-library.md` §1 (format v2) and §8 (AI
loop). Script: `scripts/src/spike-template-schema.ts` (`offline`, `compile`, `bisect`, `quality`,
`rescore`, `report`); raw results in `scripts/exports/template-schema-spike/` (git-ignored).

## Question and decision rule

Can `claude-opus-5-5` take the template format's JSON Schema as `output_config.format` with
nested stack groups, and does it produce valid documents more often than a schema-in-the-prompt
loop?

Rule (EM plan): take (a) per kind if every kind's schema compiles and its validity is at least
(c)'s. Otherwise take (b) if it compiles. Otherwise take (c).

- **(a) nested**: a group's children inline, unrolled to depth 4 with one `$defs` entry per level.
- **(b) flat**: one list of layers per page, each naming its `parentId`.
- **(c) no schema**: the format rules in the prompt, `validate.ts` retries.

## Decision: (c)

No (a) or (b) schema compiles. All 104 schemas (both shapes, two encodings each, per kind for
all 25 kinds and for the whole format) were rejected with:

> The compiled grammar is too large, which would cause performance issues. Simplify your tool
> schemas or reduce the number of strict tools.

The rule therefore lands on (c). S.3 ran (c) alone, twice over five briefs: **9 of 10
documents were valid on the first try and 10 of 10 within the two retries**, at about US$0.50 a
generation.

## What T1.11 must do

T1.11 no longer writes a schema for the AI: nothing sends `format.schema.json` to the API. It
becomes:

- **A drift test that runs `validate.ts` over every starter now and every bundle later.**
  `validate.ts` is the contract; a second, schema-shaped copy of the same rules would only drift.
- **The prompt's format guide, built from `validate.ts`'s own constants** (layer kinds, enums,
  ranges, limits), so the rules the model reads can't drift from the rules it's checked against.
  Port the spike's guide (`formatGuide()` in `scripts/src/spike-template-schema/prompt.ts`):
  prose plus one example document, 3,100–3,500 tokens with the kind's catalogue.
- **Only if a JSON Schema is still wanted as documentation:** one nested schema of the whole
  format with a recursive `$ref` for `children` (no unrolled levels, no per-kind or flat
  variants) and every constraint kept. Validating starters against it would need its own
  dependency: `ajv` is in the lockfile only as a transitive dependency.

And for T1.7–T1.8, since the validator now drives the AI's retries:

- **Its messages are the retry prompt.** They go straight back to the model, so keep them short,
  specific and plain, and name the page and layer id.
- **Say how depth is counted.** The spike counts a page's own layers as depth 1 and refuses a group
  at depth 4, so no layer sits deeper than 4. The prompt quotes whichever rule T1.8 picks.

## What L7 must do

- **T7.6, the request:** streamed to `finalMessage()`, `thinking: { type: "adaptive" }`,
  `output_config: { effort: "high" }`, **no `format`**, `max_tokens` 64000, `fallbacks: "default"`
  with beta `server-side-fallback-2026-07-01`. This is exactly what S.3 sent. 64000 is enough but
  not lavish: the four-page Match Day used 41–44k output tokens on its first try (thinking
  included), so a cut-off (`max_tokens`) must count as a failed attempt.
- **Reading the reply:** join the `text` blocks and parse JSON. Strip a code fence defensively and
  take the first `{` to the last `}`. A parse failure is an error like any validation error and
  goes back through the retry loop. Check `stop_reason` first: `refusal` is outcome `refused`,
  `max_tokens` is an error.
- **T7.7, the loop:** validate, then append the assistant's whole `content` (thinking blocks
  included: Opus 5.5's thinking is bound to the conversation, so the history must stay
  append-only) and a user turn listing the errors; at most two retries. The spike's retry turn
  is `retryTurn()` in `scripts/src/spike-template-schema/prompt.ts`.
- **T7.5, caching:** the system prompt (format guide, example, kind catalogue) was 3,100–3,500
  tokens and was cached on the first call. With the planned 2–3 bundle examples it grows, so the
  1-hour breakpoint on the system block in §8 is right.
- **Never send a schema through the SDK's helpers** (`jsonSchemaOutputFormat`, `zodOutputFormat`)
  if structured outputs come back later: in `@anthropic-ai/sdk` 0.135 their transform also moves
  `enum`, `const` and `pattern` into the description, not only the numeric and length
  constraints, so token enums would stop being enforced.
- **Cost and time per generation** (S.3): US$0.20–0.88 for a first try (one-page kinds
  US$0.20–0.41, two-page Match Summary US$0.56–0.69, four-page Match Day US$0.84–0.88), US$0.50 on average including retries; 9.5k–44k output
  tokens; 84–368 s for a first try (mean 204 s). Generations must run as jobs, as §8 plans, and
  the console should say a design takes a few minutes. Budget T7.13's cost figure from these.
- **No refusals and no fallbacks** in 14 requests; every reply ended with `end_turn` and parsed as
  JSON.

## Evidence

### S.1: the shapes, offline

The spike drafted the format from §1 and the v1 document (`scripts/src/spike-template-schema/format.ts`),
because L1-A hadn't pushed T1.1 yet. Page catalogues for `title`, `day` and `sponsors` are a
stand-in for T1.4 (the tokens Club Kit's bookends and day slides bind today, plus `dayRows` and
`sponsors`).

Two encodings of (a) and (b):

- **faithful**: what a generator would write from the TypeScript types: optional fields, the
  layer union as `anyOf`, records as keyed properties.
- **strict**: rewritten for structured outputs' published limits (24 optional parameters and 16
  union-typed parameters per request): every property required, no `anyOf`, anything optional as
  a list of at most one, style as `{ prop, value }` pairs, geometry as one box per size.

| shape | encoding | scope         | bytes         | `$defs` | `$ref` | `anyOf` | optional props | `$ref`s to unions | enums  |
| ----- | -------- | ------------- | ------------- | ------- | ------ | ------- | -------------- | ----------------- | ------ |
| a     | faithful | whole         | 49,039        | 14      | 372    | 4       | 481            | 10                | 53     |
| a     | faithful | per kind (25) | 20,573–73,333 | 13–30   | 95–408 | 4–16    | 188–678        | 4–16              | 46–156 |
| a     | strict   | whole         | 24,490        | 13      | 38     | 0       | 0              | 0                 | 29     |
| a     | strict   | per kind (25) | 13,501–39,326 | 12–29   | 32–128 | 0       | 0              | 0                 | 23–63  |
| b     | faithful | whole         | 27,771        | 11      | 293    | 1       | 371            | 7                 | 27     |
| b     | faithful | per kind (25) | 10,465–28,383 | 10–18   | 31–122 | 1–4     | 95–272         | 1–4               | 23–58  |
| b     | strict   | whole         | 14,744        | 10      | 14     | 0       | 0              | 0                 | 23     |
| b     | strict   | per kind (25) | 8,861–19,446  | 9–17    | 11–38  | 0       | 0              | 0                 | 17–39  |

Bytes are the schema as sent. Every object has `additionalProperties: false`.

**What gets stripped.** Structured outputs don't accept `minimum`, `maximum`, `minLength`,
`maxLength` or `maxItems` (beyond `minItems` 0 or 1). The spike moves them into the description,
as the SDK does: in the whole-format faithful (a) schema that is 34 `minimum`, 34 `maximum`, 44
`maxLength` and 35 `maxItems`. The SDK's own transform (`transformJSONSchema`, used by
`jsonSchemaOutputFormat`) also moves all 53 `enum`s, 20 `const`s and 23 `pattern`s into
descriptions, so the spike sent its own transform's output instead. Either way every range,
length and list bound is checked only by `validate.ts`.

### S.2: compile

Each schema was sent once with `max_tokens` 64, effort `low`.

| shape | encoding | whole format | per kind         | cost |
| ----- | -------- | ------------ | ---------------- | ---- |
| a     | faithful | rejected     | 0 of 25 accepted | $0   |
| a     | strict   | rejected     | 0 of 25 accepted | $0   |
| b     | faithful | rejected     | 0 of 25 accepted | $0   |
| b     | strict   | rejected     | 0 of 25 accepted | $0   |

Every rejection was the "compiled grammar is too large" 400, returned in about half a second.
Even the smallest, the strict flat milestone schema (8,963 bytes, one page, no optional
properties, no unions, no repeat lists), was too large. The 24-optional and 16-union limits were never what stopped them: the grammar size
limit fires first.

**Where the limit sits** (`bisect`, the milestone schema with parts removed one step at a time):

| step (cumulative)                     | flat (b)               | nested (a), depth 4 |
| ------------------------------------- | ---------------------- | ------------------- |
| full strict schema                    | rejected (8,963 B)     | rejected (13,756 B) |
| no `pattern` on ids                   | rejected               | rejected            |
| style as `{ prop, value }` pairs only | rejected               | rejected            |
| no motion, showWhen, fit or stack     | **accepted** (6,739 B) | rejected            |
| no name, hidden, bind or svg          | accepted               | rejected            |
| no style at all                       | accepted               | rejected (7,829 B)  |

- A flat schema compiles only once motion, conditions, text fit, stacks and every structured
  style value are gone: a skeleton that can't express format v2.
- The nested schema never compiles at depth 4, even as a bare `{ id, kind, content, boxes,
children }` skeleton: each unrolled level repeats the whole layer grammar.
- When a schema does compile: about 4.0–4.8 s for the first call and 2.3 s once cached, so about
  2 s of compile. The schema bills as input: about 3,900–4,200 tokens for a 6–7 KB schema.

### S.3: quality

5 briefs × (c), run twice (rounds 1 and 2), streamed, adaptive thinking, effort `high`, `fallbacks: "default"`, at most two
retries. Scored with the spike's stand-in validator (`scripts/src/spike-template-schema/validate.ts`),
which follows v1's rules and adds v2's: page keys valid for the kind, tokens and lists valid for
the page, depth, layer limits and an SVG allowlist.

| brief (kind, pages)             | round | first try                                         | within 2 retries | layers | depth | stack groups | output tokens  | cost  |
| ------------------------------- | ----- | ------------------------------------------------- | ---------------- | ------ | ----- | ------------ | -------------- | ----- |
| match-day (matchDay, 4)         | 1     | valid                                             | valid            | 65     | 2     | 4            | 40,880         | $0.84 |
| ladder (ladder, 1)              | 1     | valid                                             | valid            | 20     | 2     | 1            | 11,797         | $0.25 |
| milestone (milestone, 1)        | 1     | valid                                             | valid            | 17     | 2     | 1            | 9,454          | $0.21 |
| team-list (teamList, 1)         | 1     | 1 error: a 131-character gradient in `background` | valid (2nd try)  | 27     | 3     | 3            | 17,218 + 7,283 | $0.59 |
| match-summary (matchSummary, 2) | 1     | valid                                             | valid            | 47     | 4     | 10           | 27,071         | $0.56 |
| match-day                       | 2     | valid                                             | valid            | 85     | 2     | 9            | 43,798         | $0.88 |
| ladder                          | 2     | valid                                             | valid            | 23     | 2     | 1            | 13,384         | $0.28 |
| milestone                       | 2     | valid                                             | valid            | 30     | 2     | 2            | 15,566         | $0.33 |
| team-list                       | 2     | valid                                             | valid            | 29     | 3     | 3            | 19,451         | $0.41 |
| match-summary                   | 2     | valid                                             | valid            | 45     | 4     | 6            | 33,522         | $0.69 |

**(c): 9/10 valid first try, 10/10 within two retries, US$0.50 a generation on average.**

- The designs follow their briefs and use v2's new parts: all ten use stack groups (match-summary
  nests them to depth 4). The milestone design, for example, has a gold `textFill` number with a
  `shine` loop, a grain overlay, crest fallbacks via `showWhen` for no-photo and junior cards, and a
  name block that collapses when the tier label is empty.
- The one real error is a v1 limit: colour strings are capped at 120 characters, and a CSS
  gradient in `background` ran past it. v2 has `fill` for gradients; T1.7 should keep the cap
  and its message should point at `fill`.
- **Two scoring bugs in the spike were fixed during the run**, and the saved replies re-scored
  (`rescore`): image fields on the carousel pages (`{{clubLogo}}`) were missing from the
  validator's token list, and children of a group shown on only some sizes were asked for boxes on
  every size. Three retries ran on those false errors before the fixes; they are dropped from the
  table and their US$1.70 is in the spend. The second one is a real question for T1.7: **a layer
  inside a group should only need boxes on the sizes its group is on.**

### Spend

**US$6.83** of the US$20 approved, over 155 calls:

- S.2 and the bisection: US$0.10. Rejected schemas aren't billed; the six accepted bisection
  probes cost about US$0.017 each.
- S.3: US$6.72, of which US$5.02 is the ten generations in the table and US$1.70 the three
  retries on false errors.

Every call was priced from its `usage` into a ledger before the next was sent, and a call was
only sent when its worst case still fitted under the cap.

## Caveats

- **The format is the spike's draft, not T1.1's.** T1.1 may add or drop fields, but the bisection
  shows the limit is far below any useful schema: a nested depth-4 skeleton with five properties
  per layer fails, and a flat one compiles only when stripped of the v2 features. A leaner T1.1
  won't change the answer.
- **The validator is a stand-in** for L1-B's (T1.7–T1.9), and nothing was rendered or fit-checked.
  The validity figures are an upper bound on what L1-B's validator plus the fit check will pass.
- **The grammar limit is server-side and unpublished.** It can move. Re-checking costs nothing
  (a rejected schema isn't billed): `pnpm --filter @workspace/scripts run spike-template-schema
compile` after deleting `scripts/exports/template-schema-spike/compile.json`. If a future model
  or API change lets (b) strict compile, revisit with this script's `quality` command.
