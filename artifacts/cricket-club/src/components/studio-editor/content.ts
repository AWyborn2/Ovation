/**
 * Content logic for the editor panels (Social Studio U17): charts from the
 * card's own scorecard data, the grouped player block, recolour-to-brand and
 * the sponsor-strip lock. Pure functions over the adjustments document.
 */
import type { FreeLayer } from "@/lib/pack-render";
import type { ChartRow, ChartSpec, ChartType } from "@/lib/pack-render/layer-kinds";
import { isSponsorSlot } from "@/lib/pack-render/adjustments";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { newId, type EditorDoc } from "./document";

/** Build a chart from the card's scorecard data; rows are empty when it has none. */
export function chartFromInput(type: ChartType, input: ShareCardInput): ChartSpec {
  const rows: ChartRow[] = [];
  if (input.kind === "matchSummary") {
    const club = input.innings.filter((i) => i.teamKey === "club");
    const opp = input.innings.filter((i) => i.teamKey === "opposition");
    if (type === "battingCard") {
      for (const b of club.flatMap((i) => i.topBatters)) {
        rows.push({
          label: b.name,
          value: `${b.runs}${b.notOut ? "*" : ""}`,
          sub: b.balls != null ? `(${b.balls})` : undefined,
        });
      }
    }
    if (type === "bowlingFigures") {
      // Our bowlers bowl in the opposition's innings.
      for (const b of opp.flatMap((i) => i.topBowlers)) {
        rows.push({ label: b.name, value: `${b.wickets}/${b.runs}`, sub: `(${b.overs})` });
      }
    }
  }
  if (input.kind === "ladder" && type === "ladder") {
    for (const r of input.rows) {
      rows.push({
        label: `${r.pos}. ${r.team}`,
        value: String(r.points),
        sub: `${r.won}-${r.lost}`,
        highlight: r.isClub,
      });
    }
  }
  return { type, rows };
}

export type BlockPlayer = {
  id: number;
  name: string;
  imageUrl?: string | null;
  capNumber?: number | null;
  games?: number | null;
  runs?: number | null;
  wickets?: number | null;
};

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-AU");

/**
 * A player block: circle-framed photo, two-line name, cap tile and a stats
 * line, grouped so it selects and moves as one, and bound to the player.
 */
export function playerBlock(player: BlockPlayer, size: CardSize, now = Date.now()): FreeLayer[] {
  const group = newId("g");
  const base = { group, playerId: player.id, editedAt: { [size]: now } };
  const box = (x: number, y: number, w: number, h: number) => ({ [size]: { x, y, w, h } });
  const layers: FreeLayer[] = [
    {
      ...base,
      id: newId(),
      kind: "image",
      name: `${player.name} photo`,
      content: player.imageUrl ?? undefined,
      style: { radius: 9999 },
      geometry: box(8, 58, 22, 22),
    },
    {
      ...base,
      id: newId(),
      kind: "text",
      name: player.name,
      content: player.name.replace(" ", "\n"),
      style: { fontSize: 6, fontWeight: 800, align: "left" },
      geometry: box(33, 58, 50, 14),
    },
    {
      ...base,
      id: newId(),
      kind: "text",
      name: `${player.name} stats`,
      content: `${fmt(player.games)} M · ${fmt(player.runs)} runs · ${fmt(player.wickets)} wkts`,
      style: {
        fontSize: 2.6,
        fontWeight: 600,
        align: "left",
        fontFamily: "'IBM Plex Mono',monospace",
      },
      geometry: box(33, 73, 55, 5),
    },
  ];
  if (player.capNumber != null) {
    layers.push({
      ...base,
      id: newId(),
      kind: "text",
      name: `Cap ${player.capNumber}`,
      content: `CAP ${player.capNumber}`,
      style: {
        fontSize: 2.6,
        fontWeight: 800,
        background: "var(--gold)",
        color: "var(--accent-ink,var(--ink))",
        radius: 6,
      },
      geometry: box(8, 81, 13, 4),
    });
  }
  return layers;
}

const HEX = /^#([0-9a-f]{6})$/i;

function rgb(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The palette colour nearest `hex` by RGB distance (null when `hex` isn't a hex colour). */
export function nearestBrandColour(hex: string, palette: string[]): string | null {
  const c = rgb(hex);
  if (!c) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const p of palette) {
    const q = rgb(p);
    if (!q) continue;
    const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Recolour every free layer's non-brand hex colour to the nearest colour in
 * the tenant's own palette. Token colours (var(--gold) etc.) are already on
 * brand and are left alone.
 */
export function recolourToBrand(doc: EditorDoc, palette: string[]): EditorDoc {
  const lower = palette.map((p) => p.toLowerCase());
  const fix = (v: string | undefined) =>
    v && HEX.test(v) && !lower.includes(v.toLowerCase())
      ? (nearestBrandColour(v, palette) ?? v)
      : v;
  return {
    ...doc,
    layers: (doc.layers ?? []).map((l) =>
      l.style
        ? {
            ...l,
            style: { ...l.style, color: fix(l.style.color), background: fix(l.style.background) },
          }
        : l,
    ),
  };
}

/**
 * Lock or unlock the sponsor strip. Locking also restores any sponsor slot
 * that was hidden, so a missing strip comes back.
 */
export function setSponsorLock(doc: EditorDoc, on: boolean): EditorDoc {
  if (!on) return { ...doc, sponsorLock: false };
  return {
    ...doc,
    sponsorLock: true,
    hidden: (doc.hidden ?? []).filter((h) => !(h.startsWith("slot:") && isSponsorSlot(h.slice(5)))),
  };
}

/** A live text layer bound to a card field. */
export function liveField(key: string, label: string, size: CardSize, now = Date.now()): FreeLayer {
  return {
    id: newId(),
    kind: "text",
    name: `Live · ${label}`,
    bind: key,
    style: { fontSize: 5, fontWeight: 800 },
    geometry: { [size]: { x: 15, y: 45, w: 70, h: 10 } },
    editedAt: { [size]: now },
  };
}
