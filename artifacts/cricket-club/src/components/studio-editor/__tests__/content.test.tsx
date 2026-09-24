/**
 * Social Studio U17 — editor content: player blocks, recolour-to-brand, the
 * sponsor-strip lock, cricket charts from the card's data, live fields and
 * library photos.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderPackCard, resolvePackTokens, brandDefaultTokens } from "@/lib/pack-render";
import { renderChart } from "@/lib/pack-render/layer-kinds";
import type { ShareCardInput } from "@/lib/share-card";
import {
  chartFromInput,
  liveField,
  nearestBrandColour,
  playerBlock,
  recolourToBrand,
  setSponsorLock,
} from "../content";
import { selectionFor, setImage, toggleHidden, type EditorDoc } from "../document";
import { ContentPanel } from "../panels";

afterEach(() => cleanup());

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });

const matchSummary = {
  kind: "matchSummary",
  matchTitle: "A Grade · Round 5",
  result: "Won by 5 wickets",
  resultWinner: "club",
  club: { name: "Demo" },
  opposition: { name: "Rivals" },
  innings: [
    {
      teamKey: "opposition",
      inningsNum: 1,
      totalRuns: "185",
      wickets: "10",
      overs: "44.3",
      topBatters: [{ name: "R. Batter", runs: 64 }],
      topBowlers: [{ name: "S. Player", wickets: 3, runs: 28, overs: "9" }],
    },
    {
      teamKey: "club",
      inningsNum: 1,
      totalRuns: "186",
      wickets: "5",
      overs: "41.1",
      topBatters: [{ name: "T. Opener", runs: 72, balls: 80, notOut: true }],
      topBowlers: [],
    },
  ],
} as unknown as ShareCardInput;

describe("player block", () => {
  it("inserts a grouped photo, name, cap and stats set bound to the player", () => {
    const layers = playerBlock(
      {
        id: 42,
        name: "Mitchell Caine",
        imageUrl: "/p.jpg",
        capNumber: 242,
        games: 48,
        runs: 1284,
        wickets: 61,
      },
      "square",
    );
    expect(layers.map((l) => l.kind).sort()).toEqual(["image", "text", "text", "text"]);
    expect(new Set(layers.map((l) => l.group)).size).toBe(1);
    expect(layers.every((l) => l.playerId === 42)).toBe(true);
    expect(layers.some((l) => l.content === "CAP 242")).toBe(true);
    expect(layers.some((l) => l.content?.includes("1,284 runs"))).toBe(true);
    // Clicking any member selects the whole block.
    const doc: EditorDoc = { layers };
    expect(selectionFor(doc, layers[2].id, null)).toHaveLength(4);
  });

  it("omits the cap tile for an uncapped player", () => {
    expect(playerBlock({ id: 1, name: "New Player" }, "square")).toHaveLength(3);
  });
});

describe("recolour to brand", () => {
  const palette = ["#FBAC27", "#10151B", "#42342B"];

  it("maps a non-brand fill to the nearest tenant colour", () => {
    expect(nearestBrandColour("#ff9900", palette)).toBe("#FBAC27");
    expect(nearestBrandColour("#000000", palette)).toBe("#10151B");
    const doc = recolourToBrand(
      {
        layers: [
          { id: "a", kind: "shape", style: { background: "#ff9900" }, geometry: {} },
          { id: "b", kind: "text", style: { color: "var(--gold)" }, geometry: {} },
          { id: "c", kind: "text", style: { color: "#10151b" }, geometry: {} },
        ],
      },
      palette,
    );
    expect(doc.layers![0].style!.background).toBe("#FBAC27");
    expect(doc.layers![1].style!.color).toBe("var(--gold)");
    expect(doc.layers![2].style!.color).toBe("#10151b");
  });
});

describe("sponsor-strip lock", () => {
  it("restores a hidden strip, blocks hiding it, and disables its control with a tooltip", () => {
    let doc: EditorDoc = { hidden: ["slot:sponsor1", "field:headline"] };
    doc = setSponsorLock(doc, true);
    expect(doc.hidden).toEqual(["field:headline"]);
    // Hiding a sponsor slot does nothing while locked; other slots still hide.
    expect(toggleHidden(doc, "slot:sponsor2")).toBe(doc);
    expect(toggleHidden(doc, "slot:photo").hidden).toContain("slot:photo");

    render(
      <ContentPanel
        doc={doc}
        fields={[]}
        values={{}}
        slots={[{ key: "sponsor1", label: "Sponsor 1", type: "logo" }]}
        size="square"
        photo={{ focalX: 0.5, focalY: 0.5, zoom: 1 }}
        onField={() => {}}
        onToggleHidden={() => {}}
        onPhoto={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "Hide Sponsor 1" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/sponsor strip is locked/i);
  });

  it("keeps sponsor slots rendering while locked even if hidden entries remain", () => {
    const input = matchSummary;
    const hidden = renderPackCard(input, "square", true, tokens, false, null, "broadcast-dark", {
      hidden: ["slot:sponsor1"],
    });
    const locked = renderPackCard(input, "square", true, tokens, false, null, "broadcast-dark", {
      hidden: ["slot:sponsor1"],
      sponsorLock: true,
    });
    expect(hidden).toContain('data-hidden-slot="sponsor1"');
    expect(locked).not.toContain('data-hidden-slot="sponsor1"');
  });
});

describe("cricket charts", () => {
  it("builds bowling figures and top scorers from the card's own scorecard", () => {
    const bowling = chartFromInput("bowlingFigures", matchSummary);
    expect(bowling.rows).toEqual([{ label: "S. Player", value: "3/28", sub: "(9)" }]);
    const batting = chartFromInput("battingCard", matchSummary);
    expect(batting.rows[0]).toMatchObject({ label: "T. Opener", value: "72*", sub: "(80)" });
  });

  it("a wagon wheel for a match with no shot data shows its empty state", () => {
    const html = renderChart(chartFromInput("wagonWheel", matchSummary));
    expect(html).toContain('data-chart-empty="1"');
    expect(html).toContain("No shot data for this match");
  });
});

describe("live fields and library photos", () => {
  it("a live text layer shows the card's current field value", () => {
    const layer = liveField("playerName", "Player name", "square");
    const input = {
      kind: "century",
      playerName: "Sam Keeper",
      runs: 104,
      grade: "A Grade",
    } as ShareCardInput;
    const html = renderPackCard(input, "square", true, tokens, false, null, "broadcast-dark", {
      layers: [layer],
    });
    const overlay = html.slice(html.indexOf("pack-free-layers"));
    expect(overlay).toContain("Sam Keeper");
  });

  it("setting a library photo as the card photo overrides the slot", () => {
    const input = {
      kind: "century",
      playerName: "Sam",
      runs: 104,
      grade: "A",
      photoUrl: "/old.jpg",
    } as ShareCardInput;
    const doc = setImage({}, "photo", "/api/storage/objects/library/9");
    const html = renderPackCard(input, "square", true, tokens, false, null, "broadcast-dark", doc);
    expect(html).toContain("/api/storage/objects/library/9");
    expect(html).not.toContain("/old.jpg");
  });
});

describe("toolbar colour input", () => {
  it("is offered for text and shape layers", async () => {
    const { EditorToolbar } = await import("../toolbar");
    render(
      <EditorToolbar
        selected={[{ id: "a", kind: "shape", geometry: {} }]}
        isGroup={false}
        onText={() => {}}
        onColour={() => {}}
        onLock={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onGroup={() => {}}
        onUngroup={() => {}}
      />,
    );
    expect(screen.getByLabelText("Custom colour")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
  });
});
