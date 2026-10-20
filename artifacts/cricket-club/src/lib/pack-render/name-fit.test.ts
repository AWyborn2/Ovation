import { describe, it, expect } from "vitest";
import { balancedLongestLine, fitFor, fitNames, MIN_FIT } from "./name-fit";

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
    // One word can't wrap, so it shrinks past the floor instead.
    expect(fitFor(9, 4, ["ABANDONED"])).toEqual({ scale: 4 / 9, lines: 1 });
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

  it("a list row wraps only at the minimum size, so the row keeps its height", () => {
    const row = (text: string) =>
      `<span data-fit="14" data-fit-row style="font-size:calc(2.9cqmin * var(--fit,1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${text}</span>`;
    // One line, shrunk: same as any box.
    expect(fitNames(row("WHITE KNIGHTS BALDIVIS"))).toContain("--fit:0.636;");
    // Two lines: at the minimum, never larger.
    const out = fitNames(row("ROCKINGHAM MANDURAH DISTRICT SEAHAWKS"));
    expect(out).toContain(`--fit:${MIN_FIT.toFixed(3)};`);
    expect(out).toContain("-webkit-line-clamp:2");
    expect(out).toContain("text-overflow:ellipsis");
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
