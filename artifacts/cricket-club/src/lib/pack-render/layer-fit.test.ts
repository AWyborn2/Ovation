/**
 * Shrink-to-fit (plan U2, KTD9). jsdom does no layout, so the loop is tested
 * with a fake measurer and the DOM adapter with faked element metrics; the
 * real-browser case is covered by the render-harness smoke test.
 */
import { describe, expect, it } from "vitest";
import {
  BLANK_PACK_ID,
  brandDefaultTokens,
  renderPackCard,
  resolvePackTokens,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";
import { primaryPage, WORST_CASE_NAMES } from "@workspace/scorecard/kind-templates";
import type { CardAdjustments, FreeLayer } from "./adjustments";
import {
  FIT_ATTR,
  FIT_WORDS_ATTR,
  fitLayersInDom,
  fitRowCellTarget,
  fitScales,
  fitTarget,
  truncateAtWord,
} from "./layer-fit";

/** A target that overflows until its scale drops to `fitsAt`. */
const fake = (fitsAt: number) => {
  let scale = 1;
  return {
    target: {
      base: 10,
      apply: (s: number) => {
        scale = s;
      },
      overflows: () => scale > fitsAt + 1e-9,
    },
    get scale() {
      return scale;
    },
  };
};

describe("fitScales", () => {
  it("steps down from 1 to the floor", () => {
    const scales = fitScales(0.6, 0.1);
    expect(scales[0]).toBe(1);
    expect(scales.at(-1)).toBe(0.6);
    expect(scales).toEqual([1, 0.9, 0.8, 0.7, 0.6]);
  });
});

describe("fitTarget", () => {
  it("leaves text that fits at full size", () => {
    const f = fake(1);
    expect(fitTarget(f.target)).toEqual({ scale: 1, fits: true });
    expect(f.scale).toBe(1);
  });

  it("shrinks overflowing text to the largest size that fits (AE2)", () => {
    const f = fake(0.8);
    expect(fitTarget(f.target)).toEqual({ scale: 0.8, fits: true });
    expect(f.scale).toBe(0.8);
  });

  it("stops at the 60% floor and reports it doesn't fit (AE2)", () => {
    const f = fake(0.3);
    expect(fitTarget(f.target)).toEqual({ scale: 0.6, fits: false });
    expect(f.scale).toBe(0.6);
  });
});

/**
 * A row cell whose text is as wide as its characters at its scale, in a box
 * `room` characters wide at the 60% floor.
 */
const cellFake = (text: string, room: number) => {
  const words = text.trim().split(/\s+/);
  let shown = text;
  let scale = 1;
  return {
    target: {
      base: 10,
      words,
      apply: (s: number) => {
        scale = s;
      },
      overflows: () => shown.length * scale > room * 0.6 + 1e-9,
      truncate: (n: number | null) => {
        shown = n === null ? text : truncateAtWord(words, n);
      },
      clip: () => {
        shown = `${text.slice(0, room - 1)}…`;
      },
    },
    get shown() {
      return shown;
    },
  };
};

describe("truncateAtWord", () => {
  it("keeps whole words and ends in an ellipsis", () => {
    expect(truncateAtWord(["Rockingham", "Mandurah", "Districts"], 2)).toBe("Rockingham Mandurah…");
  });

  it("leaves no separator hanging before the ellipsis", () => {
    const words = "Pharmacy 777 - All Nations Cup - Premier League".split(" ");
    expect(truncateAtWord(words, 3)).toBe("Pharmacy 777…");
    expect(truncateAtWord(words, 6)).toBe("Pharmacy 777 - All Nations Cup…");
    expect(truncateAtWord(["Bunbury", "&", "Districts"], 2)).toBe("Bunbury…");
    expect(truncateAtWord(["Shield", "(Male", "Under"], 1)).toBe("Shield…");
    expect(truncateAtWord(["Perth,", "WA"], 1)).toBe("Perth…");
  });
});

describe("fitRowCellTarget", () => {
  it("leaves a cell that fits at full size", () => {
    const f = cellFake("Halls Head", 20);
    expect(fitRowCellTarget(f.target)).toEqual({ scale: 1, fits: true, cut: "none" });
    expect(f.shown).toBe("Halls Head");
  });

  it("shrinks a cell that fits once smaller, without cutting it", () => {
    const f = cellFake("Rockingham Mandurah", 20);
    expect(fitRowCellTarget(f.target)).toMatchObject({ fits: true, cut: "none" });
    expect(f.shown).toBe("Rockingham Mandurah");
  });

  it("past the floor, ends after the last whole word that fits", () => {
    const f = cellFake("Rockingham Mandurah District Cricket Club", 20);
    expect(fitRowCellTarget(f.target)).toEqual({ scale: 0.6, fits: true, cut: "word" });
    expect(f.shown).toBe("Rockingham Mandurah…");
  });

  it("cuts mid-word when not even the first word fits, and that doesn't fit", () => {
    const f = cellFake("Leyferdacalgusricvinwo Tonn", 10);
    expect(fitRowCellTarget(f.target)).toEqual({ scale: 0.6, fits: false, cut: "mid-word" });
    expect(f.shown).toBe("Leyferdac…");
  });

  // Every worst-case name the fit check draws, in a narrow, a middling and a wide cell.
  const names = [
    ...WORST_CASE_NAMES.teams.map((t) => t.card),
    ...WORST_CASE_NAMES.grades.map((g) => g.card),
    ...WORST_CASE_NAMES.juniorGrades.map((g) => g.card),
    ...WORST_CASE_NAMES.venues,
    ...WORST_CASE_NAMES.players,
    ...WORST_CASE_NAMES.playersLongWord,
  ];
  it.each(names.flatMap((name) => [8, 16, 30].map((room) => ({ name, room }))))(
    "fits $name in $room characters, or says it's cut mid-word",
    ({ name, room }) => {
      const f = cellFake(name, room);
      const words = name.split(/\s+/);
      const result = fitRowCellTarget(f.target);
      if (name.length <= room) {
        expect(result.cut).toBe("none");
        expect(f.shown).toBe(name);
      } else if (truncateAtWord(words, 1).length <= room) {
        expect(result).toMatchObject({ fits: true, cut: "word" });
        expect(f.shown.endsWith("…")).toBe(true);
        expect(f.shown.length).toBeLessThanOrEqual(room);
        // Cut between words: the name goes on with a space or a separator, never a letter.
        const kept = f.shown.slice(0, -1);
        expect(name.startsWith(kept)).toBe(true);
        expect(name[kept.length]).toMatch(/[^\p{L}\p{N}]/u);
      } else {
        expect(result).toMatchObject({ fits: false, cut: "mid-word" });
      }
    },
  );
});

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });

/** Mount card html and fake each fittable element's metrics. */
function mount(html: string, overflowFor: (el: HTMLElement) => boolean): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${FIT_ATTR}]`))) {
    Object.defineProperty(el, "clientWidth", { configurable: true, get: () => 100 });
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 20 });
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 20 });
    Object.defineProperty(el, "scrollWidth", {
      configurable: true,
      get: () => (overflowFor(el) ? 200 : 100),
    });
  }
  return root;
}

describe("fitLayersInDom", () => {
  const player = {
    kind: "player",
    playerName: "Christopher Van Der Merwe",
    headline: "",
    stats: [],
  } as unknown as ShareCardInput;
  const nameLayer: FreeLayer = {
    id: "name",
    kind: "text",
    content: "{{playerName}}",
    style: { fontSize: 8 },
    geometry: { square: { x: 0, y: 0, w: 50, h: 10 } },
  };
  const html = renderPackCard(player, "square", true, tokens, false, null, BLANK_PACK_ID, {
    layers: [nameLayer],
  });

  it("marks only live-field text as fittable", () => {
    expect(html).toContain('data-layer-fit="8.00"');
    const typed = renderPackCard(player, "square", true, tokens, false, null, BLANK_PACK_ID, {
      layers: [{ ...nameLayer, content: "TYPED" }],
    });
    expect(typed).not.toContain(FIT_ATTR);
  });

  it("returns no warnings when text fits", () => {
    expect(
      fitLayersInDom(
        mount(html, () => false),
        "square",
      ),
    ).toEqual([]);
  });

  it("shrinks text that fits once smaller, with no warning", () => {
    const scaleOf = (el: HTMLElement) => Number(el.getAttribute("data-fit-scale") ?? "1");
    const root = mount(html, (el) => scaleOf(el) > 0.75);
    expect(fitLayersInDom(root, "square")).toEqual([]);
    expect(root.querySelector<HTMLElement>(`[${FIT_ATTR}]`)!.getAttribute("data-fit-scale")).toBe(
      "0.75",
    );
  });

  it("reports text that never fits, naming the layer and size", () => {
    expect(
      fitLayersInDom(
        mount(html, () => true),
        "square",
      ),
    ).toEqual([{ reason: "overflow", size: "square", layerId: "name" }]);
  });

  it("reports an overflowing list-row cell with its row and field", () => {
    const ladder = {
      kind: "ladder",
      competitionName: "PCA",
      gradeLabel: "A Grade",
      asOfLabel: "Round 5",
      rows: [
        { pos: 1, team: "Rockingham Mandurah Districts", played: 5, won: 4, lost: 1, points: 24 },
        { pos: 2, team: "Halls Head", played: 5, won: 3, lost: 2, points: 18 },
      ],
    } as unknown as ShareCardInput;
    const rows: FreeLayer = {
      id: "table",
      kind: "rows",
      geometry: { square: { x: 0, y: 30, w: 100, h: 50 } },
      rows: {
        repeat: "rows",
        rowHeight: 8,
        cells: [{ field: "team", x: 0, w: 60, style: { fontSize: 4 } }],
      },
    };
    const card = renderPackCard(ladder, "square", true, tokens, false, null, BLANK_PACK_ID, {
      layers: [rows],
    });
    const root = mount(card, (el) => (el.textContent ?? "").length > 20);
    expect(fitLayersInDom(root, "square")).toEqual([
      { reason: "overflow", size: "square", layerId: "table", row: 0, field: "team" },
    ]);
  });

  describe("format v2 list-row cells", () => {
    const ladder = {
      kind: "ladder",
      competitionName: "PCA",
      gradeLabel: "A Grade",
      asOfLabel: "Round 5",
      rows: [
        { pos: 1, team: "Rockingham Mandurah Districts", played: 5, won: 4, lost: 1, points: 24 },
        { pos: 2, team: "Leyferdacalgusricvinwo", played: 5, won: 3, lost: 2, points: 18 },
      ],
    } as unknown as ShareCardInput;
    const rows: FreeLayer = {
      id: "table",
      kind: "rows",
      geometry: { square: { x: 0, y: 30, w: 100, h: 50 } },
      rows: {
        repeat: "rows",
        rowHeight: 8,
        cells: [{ field: "team", x: 0, w: 60, style: { fontSize: 4 } }],
      },
    };
    const draw = (doc: CardAdjustments) =>
      renderPackCard(ladder, "square", true, tokens, false, null, BLANK_PACK_ID, doc);
    const v2 = {
      formatVersion: 2,
      pages: { [primaryPage("ladder")]: { layers: [rows] } },
    } as unknown as CardAdjustments;
    const cells = (root: HTMLElement) =>
      Array.from(root.querySelectorAll<HTMLElement>('[data-row-cell="team"]'));

    it("marks v2 row cells for the word cut, and leaves v1 cells as they were", () => {
      expect(draw(v2)).toContain(FIT_WORDS_ATTR);
      expect(draw({ layers: [rows] })).not.toContain(FIT_WORDS_ATTR);
    });

    it("ends a long name after its last whole word that fits, with no warning", () => {
      const root = mount(draw(v2), (el) => (el.textContent ?? "").length > 20);
      const warnings = fitLayersInDom(root, "square");
      expect(cells(root)[0]!.textContent).toBe("Rockingham Mandurah…");
      expect(warnings.filter((w) => w.row === 0)).toEqual([]);
    });

    it("reports a name cut mid-word, and keeps the whole text for a re-fit", () => {
      const root = mount(draw(v2), (el) => (el.textContent ?? "").length > 20);
      expect(fitLayersInDom(root, "square")).toEqual([
        {
          reason: "overflow",
          size: "square",
          layerId: "table",
          row: 1,
          field: "team",
          detail: "cut mid-word",
        },
      ]);
      // A second pass starts from the whole name, not the cut one.
      const roomy = mount(root.innerHTML, () => false);
      expect(fitLayersInDom(roomy, "square")).toEqual([]);
      expect(cells(roomy).map((c) => c.textContent)).toEqual([
        "Rockingham Mandurah Districts",
        "Leyferdacalgusricvinwo",
      ]);
    });
  });

  it.each(
    CAROUSEL_PACK_IDS.flatMap((packId) =>
      (["square", "portrait", "story", "landscape"] as const).map((size) => ({ packId, size })),
    ),
  )(
    "preserves built-in carousel preview typography when exporting $packId $size",
    ({ packId, size }) => {
      const cover: ShareCardInput = {
        kind: "matchDay",
        roundLabel: "ROUND 1",
        oppositionName: "",
        homeAway: "HOME",
        venue: "",
        date: "FRI 9 OCT – SUN 11 OCT",
        startTime: "",
        carouselPage: {
          page: "title",
          title: "TEAM LISTS",
          fixtureCount: 5,
          sponsors: [],
          hasCoverPhoto: true,
        },
      };
      const root = mount(
        renderPackCard(
          cover,
          size,
          false,
          tokens,
          false,
          {
            brand: { name: "HALLS HEAD", tagline: "CRICKET CLUB · EST 1991" },
          },
          packId,
        ),
        () => false,
      );
      // A built-in name box (its character-count marker) is in the preview.
      expect(root.querySelector("[data-fit]")).not.toBeNull();
      expect(root.querySelector("[data-carousel-cover-label]")).not.toBeNull();
      const preview = root.innerHTML;
      expect(fitLayersInDom(root, size)).toEqual([]);
      expect(root.innerHTML).toBe(preview);
      // Repeated exports must not progressively alter the saved composition.
      expect(fitLayersInDom(root, size)).toEqual([]);
      expect(root.innerHTML).toBe(preview);
    },
  );

  it("fits live layers without changing a built-in element's character-count marker", () => {
    const root = mount(
      `<div data-layer-id="club-element"><div data-fit="26" style="font-size:4.6cqmin">HALLS HEAD</div></div>${html}`,
      () => true,
    );
    const builtIn = root.querySelector<HTMLElement>('[data-fit="26"]')!;
    const before = builtIn.outerHTML;
    expect(fitLayersInDom(root, "square")).toEqual([
      { reason: "overflow", size: "square", layerId: "name" },
    ]);
    expect(builtIn.outerHTML).toBe(before);
    expect(root.querySelector(`[${FIT_ATTR}]`)?.getAttribute("data-fit-scale")).toBe("0.6");
  });
});
