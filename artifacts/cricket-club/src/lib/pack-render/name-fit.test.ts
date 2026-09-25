import { describe, it, expect } from "vitest";
import { balancedLongestLine, cardTeamName, fitFor, fitNames, MIN_FIT } from "./name-fit";

describe("cardTeamName", () => {
  it("drops the Cricket Club / CC / Inc endings", () => {
    expect(cardTeamName("White Knights Baldivis Cricket Club")).toBe("White Knights Baldivis");
    expect(cardTeamName("Halls Head Cricket Club Inc")).toBe("Halls Head");
    expect(cardTeamName("Mandurah CC")).toBe("Mandurah");
    expect(cardTeamName("Rockingham-Mandurah Cricket Inc.")).toBe("Rockingham-Mandurah");
  });

  it("keeps names without those endings, and never empties a name", () => {
    expect(cardTeamName("Rival Club")).toBe("Rival Club");
    expect(cardTeamName("Cricket Club")).toBe("Cricket Club");
    expect(cardTeamName(null)).toBe("");
  });
});

describe("fitFor", () => {
  it("leaves a short name at full size on one line", () => {
    expect(fitFor(10, 14)).toEqual({ scale: 1, lines: 1 });
  });

  it("shrinks a longer name onto one line down to the minimum", () => {
    expect(fitFor(20, 14)).toEqual({ scale: 0.7, lines: 1 });
  });

  it("wraps a name too long for one line, never smaller than the minimum", () => {
    const f = fitFor(40, 14);
    expect(f.lines).toBe(2);
    expect(f.scale).toBeCloseTo(0.7);
    expect(fitFor(80, 14).scale).toBe(MIN_FIT);
  });
});

describe("fitNames", () => {
  const box = (text: string) =>
    `<div data-fit="14" style="font-size:calc(6cqmin * var(--fit,1));white-space:nowrap;overflow:hidden">${text}</div>`;

  it("leaves names that fit untouched", () => {
    expect(fitNames(box("HALLS HEAD"))).toBe(box("HALLS HEAD"));
  });

  it("scales a long name down instead of cutting it off", () => {
    const out = fitNames(box("WHITE KNIGHTS BALDIVIS"));
    expect(out).toContain("--fit:0.636;");
    expect(out).toContain("white-space:nowrap");
  });

  it("wraps a very long name onto two lines", () => {
    const out = fitNames(box("ROCKINGHAM MANDURAH DISTRICT SEAHAWKS"));
    expect(out).toContain("white-space:normal");
    expect(out).toContain("-webkit-line-clamp:2");
  });

  it("counts an escaped character once", () => {
    expect(fitNames(box("A &amp; B"))).toBe(box("A &amp; B"));
  });
});

describe("two-line names", () => {
  it("sizes by the longer line of an even word split, so neither line is cut", () => {
    expect(balancedLongestLine(["WHITE", "KNIGHTS", "BALDIVIS"])).toBe(13);
    // 22 characters in a 10-character box: two lines, sized for "WHITE KNIGHTS".
    expect(fitFor(22, 10, ["WHITE", "KNIGHTS", "BALDIVIS"])).toEqual({
      scale: 10 / 13,
      lines: 2,
    });
  });
});
