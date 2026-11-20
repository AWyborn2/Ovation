/**
 * Builds the mocked API answers the screenshot harness serves (PR #698): a
 * queued Team Lists carousel (draft 956, the editor tests' fixture) and a
 * single Team List card (draft 957) on the Broadcast Dark look. Writes JSON to
 * the path given. Run with the scripts package's tsx:
 *   scripts/node_modules/.bin/tsx docs/testing/pr698-shots/harness/fixtures.ts out.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleSetDocument } from "../../../../lib/scorecard/src/kind-templates/set-document";

const root = path.resolve(import.meta.dirname, "../../../..");
const read = (p: string) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const TEAM_LIST = read("lib/template-bundles/broadcast-dark/teamList.json");
const MATCH_DAY = read("lib/template-bundles/broadcast-dark/matchDay.json");
const CARD_INPUT = read(
  "artifacts/cricket-club/src/components/studio-editor/__tests__/fixtures/weekend-team-lists.json",
);
const docs: Record<string, unknown> = {
  teamList: TEAM_LIST.document,
  matchDay: MATCH_DAY.document,
};
const DOC = assembleSetDocument("teamLists", (kind) => docs[kind])!.document;
const base = {
  engine: "ondemand",
  family: "matchday",
  status: "awaiting_review",
  appPath: "",
  sourceMatchIsJunior: false,
  caption: "Team lists",
  createdAt: "2026-11-17T06:21:56Z",
  packId: "blank",
  templateVersion: 4,
  templateRef: { libraryTemplateId: 66, version: 4 },
};
const set = { ...base, id: 956, cardInput: CARD_INPUT, adjustments: DOC };
const team = CARD_INPUT.weekendCarousel.slides[1].content.source;
const card = {
  ...base,
  id: 957,
  caption: "A Grade team",
  cardInput: team,
  adjustments: TEAM_LIST.document,
};
const out = process.argv[2];
if (!out) throw new Error("Give the output path.");
writeFileSync(
  out,
  JSON.stringify({
    set,
    card,
    setDesign: {
      draftId: 956,
      setType: "teamLists",
      layout: "carousel",
      document: DOC,
      templateRef: base.templateRef,
      size: "portrait",
      stored: false,
    },
  }),
);
