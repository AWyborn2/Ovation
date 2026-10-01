import type { PackManifest } from "../types";
import { clubKitPaletteFor, clubKitVars } from "../../pack-render/club-kit-vars";
import { CLUB_KIT_DESIGNS } from "./designs";

/**
 * Coverage contract: the kinds this pack renders, written as literals so
 * api-server `pack-coverage-parity.test.ts` can read them from source. Kept in
 * step with {@link CLUB_KIT_DESIGNS} by `club-kit.test.ts`.
 */
export const CLUB_KIT_COVERAGE: ReadonlyArray<{ kind: string }> = [
  { kind: "matchSummary" },
  { kind: "teamList" },
  { kind: "weekendWrap" },
  { kind: "ladder" },
  { kind: "player" },
  { kind: "milestone" },
  { kind: "debut" },
  { kind: "century" },
  { kind: "fiveFor" },
  { kind: "bigMoment" },
  { kind: "matchDay" },
  { kind: "countdown" },
  { kind: "newSigning" },
  { kind: "premiership" },
  { kind: "record" },
  { kind: "gradeLeader" },
  { kind: "clubLeaderboard" },
  { kind: "roundFixtures" },
  { kind: "tradingCard" },
  { kind: "juniorHighlights" },
  { kind: "teamListRound" },
];

/**
 * Pack F — Club Kit (`club-kit-v1`), from the "Club Colours" design handoff
 * (`docs/design-handoffs/club-colours-pack/`).
 *
 * Every colour is derived from the club's brand (`../../pack-render/club-kit-vars`):
 * the primary drives chips, bars, the hashtag block and the jumper trim; the
 * club's background colour is the secondary; junior cards swap to the juniors
 * palette. Contrast-safe `--ck-onp` / `--ck-pt` keep type legible for any
 * brand. Square corners, full-colour photos in a diagonal "jumper-trim" frame
 * (beside the body on square / landscape, above it on portrait / story), and
 * Barlow Condensed / IBM Plex type.
 *
 * `colourMode: "club-only"` — the pack IS the club's colours, so it has no
 * "Pack's own look" switch. A club with no brand colours gets the neutral
 * amber / slate fallback.
 *
 * The api-server `PACKS` entry declares the SAME kinds
 * (`pack-coverage-parity.test.ts`).
 */
export const CLUB_KIT_PACK: PackManifest = {
  packId: "club-kit-v1",
  name: "Club Kit",
  colourMode: "club-only",
  rootVars: ({ tokens, brand, junior }) => clubKitVars(clubKitPaletteFor(tokens, brand, junior)),
  designs: CLUB_KIT_DESIGNS,
};
