/**
 * Card kind templates (plan 2026-10-07-002, U1 / ADR-001): field tokens,
 * per-size presence, the empty-element rule, and the `photo` and `rows`
 * layers on the blank base.
 */
import { describe, expect, it } from "vitest";
import {
  BLANK_PACK_ID,
  brandDefaultTokens,
  renderPackCard,
  resolvePackTokens,
} from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { substituteTokens, type CardAdjustments, type FreeLayer } from "./adjustments";

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });

const player = {
  kind: "player",
  playerName: "Sam Keeper",
  headline: "Player of the round",
  stats: [
    { label: "Runs", value: "104" },
    { label: "Balls", value: "88" },
  ],
} as ShareCardInput;

const ladder = {
  kind: "ladder",
  competitionName: "PCA",
  gradeLabel: "A Grade",
  asOfLabel: "Round 5",
  rows: [
    { pos: 1, team: "Rockingham", played: 5, won: 4, lost: 1, points: 24, isClub: false },
    { pos: 2, team: "Halls Head", played: 5, won: 3, lost: 2, points: 18, isClub: true },
  ],
} as unknown as ShareCardInput;

const text = (over: Partial<FreeLayer> = {}): FreeLayer => ({
  id: "t1",
  kind: "text",
  content: "",
  geometry: { square: { x: 10, y: 10, w: 80, h: 10 } },
  ...over,
});

const render = (
  input: ShareCardInput,
  adj: CardAdjustments,
  opts: { size?: CardSize; junior?: boolean; photoUrl?: string | null } = {},
) =>
  renderPackCard(
    input,
    opts.size ?? "square",
    true,
    tokens,
    opts.junior ?? false,
    opts.photoUrl === undefined ? null : ({ photoUrl: opts.photoUrl } as never),
    BLANK_PACK_ID,
    adj,
  );

describe("field tokens in text", () => {
  it("substitutes bound values around typed text", () => {
    expect(substituteTokens("{{playerName}} – {{runs}}*", { playerName: "Sam", runs: "104" })).toBe(
      "Sam – 104*",
    );
  });

  it("renders a text layer's tokens from the card's data", () => {
    const html = render(player, { layers: [text({ content: "Well played {{playerName}}!" })] });
    expect(html).toContain("Well played Sam Keeper!");
  });

  it("escapes token values", () => {
    const html = render({ ...player, playerName: "<script>x</script>" } as ShareCardInput, {
      layers: [text({ content: "{{playerName}}" })],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not draw a box whose only content is empty fields", () => {
    const html = render(player, { layers: [text({ content: "{{noSuchField}}" })] });
    expect(html).not.toContain('data-layer-id="t1"');
  });

  it("still draws plain typed text, including empty text, as before", () => {
    const html = render(player, { layers: [text({ content: "" })] });
    expect(html).toContain('data-layer-id="t1"');
  });

  it("applies letter spacing only when set", () => {
    expect(render(player, { layers: [text({ content: "A" })] })).not.toContain("letter-spacing");
    expect(
      render(player, { layers: [text({ content: "A", style: { letterSpacing: 0.1 } })] }),
    ).toContain("letter-spacing:0.1em");
  });
});

describe("per-size presence", () => {
  it("draws a layer only on its sizes", () => {
    const adj = {
      layers: [
        text({
          content: "SQUARE ONLY",
          sizes: ["square"],
          geometry: { square: { x: 0, y: 0, w: 50, h: 10 }, story: { x: 0, y: 0, w: 50, h: 10 } },
        }),
      ],
    } satisfies CardAdjustments;
    expect(render(player, adj, { size: "square" })).toContain("SQUARE ONLY");
    expect(render(player, adj, { size: "story" })).not.toContain("SQUARE ONLY");
  });
});

describe("photo layer", () => {
  const photo: FreeLayer = {
    id: "p1",
    kind: "photo",
    geometry: { square: { x: 0, y: 0, w: 100, h: 60 } },
    photo: { square: { focalX: 30, focalY: 20, zoom: 1.2 } },
  };

  it("draws the card photo at the size's focal point and zoom", () => {
    const html = render(player, { layers: [photo] }, { photoUrl: "https://example.test/sam.jpg" });
    expect(html).toContain('src="https://example.test/sam.jpg"');
    expect(html).toContain("object-position:30% 20%");
    expect(html).toContain("scale(1.2)");
  });

  it("draws nothing without a photo", () => {
    expect(render(player, { layers: [photo] })).not.toContain('data-layer-id="p1"');
  });

  it("never draws a photo on a junior card (AE6)", () => {
    const html = render(
      player,
      { layers: [photo] },
      { junior: true, photoUrl: "https://example.test/sam.jpg" },
    );
    expect(html).not.toContain("sam.jpg");
    expect(html).not.toContain('data-layer-id="p1"');
  });
});

describe("rows layer", () => {
  const rows: FreeLayer = {
    id: "r1",
    kind: "rows",
    geometry: { square: { x: 5, y: 30, w: 90, h: 50 } },
    rows: {
      repeat: "rows",
      rowHeight: 8,
      gap: 1,
      cells: [
        { field: "pos", x: 0, w: 10 },
        { field: "team", x: 10, w: 70, style: { align: "left" } },
        { field: "points", x: 80, w: 20 },
      ],
      variants: { club: { team: { color: "#ffcc00" } } },
    },
  };

  it("renders one row per ladder entry with cells at their positions", () => {
    const html = render(ladder, { layers: [rows] });
    expect(html.match(/data-row-index=/g)).toHaveLength(2);
    expect(html).toContain("Rockingham");
    expect(html).toContain("left:10%;width:70%");
    expect(html).toContain("top:9.000cqw");
  });

  it("styles a variant row with its overrides", () => {
    const html = render(ladder, { layers: [rows] });
    expect(html).toContain('data-row-variant="club"');
    expect(html).toMatch(/data-row-variant="club"[^]*color:#ffcc00[^]*Halls Head/);
  });

  it("draws nothing when the card has no rows for the repeat", () => {
    expect(render(player, { layers: [rows] })).not.toContain('data-layer-id="r1"');
  });
});
