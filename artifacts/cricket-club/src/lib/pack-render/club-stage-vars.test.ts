/**
 * The club stage colour for template designs (Clubhouse starter): the club's
 * background colour, darkened until white type reads on it.
 */
import { describe, expect, it } from "vitest";
import { clubStageVars, deriveClubKitPalette } from "./club-kit-vars";
import { contrastRatio, MIN_TEXT_CONTRAST } from "./tokens";

const palette = (secondary: string) =>
  deriveClubKitPalette({
    primary: "#F5B400",
    secondary,
    juniors: "#5A3E2B",
    chalk: "#F2F5F8",
    junior: false,
  });
const stageOf = (vars: string) => /--ck-stage:(#[0-9A-F]{6})/i.exec(vars)?.[1] ?? "";

describe("clubStageVars", () => {
  it("keeps a dark club colour as it is", () => {
    expect(stageOf(clubStageVars(palette("#1C2472")))).toBe("#1C2472");
  });

  it("darkens a light club colour until white type reads on it", () => {
    const stage = stageOf(clubStageVars(palette("#F7F2E0")));
    expect(stage).not.toBe("#F7F2E0");
    expect(contrastRatio(stage, "#FFFFFF")).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it("emits the deep shade and the translucent tints", () => {
    const vars = clubStageVars(palette("#1C2472"));
    for (const name of ["--ck-stage-deep", "--ck-stage-80", "--ck-stage-55", "--ck-stage-0"])
      expect(vars).toContain(`${name}:`);
  });
});
