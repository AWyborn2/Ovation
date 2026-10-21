/**
 * Format v2 must not change how a stored v1 document renders (ADR-011 §1,
 * T1.6; again in T3.22). Every starter × kind × size × sample, stress and
 * junior card, pilot-shaped documents (editor edits on top of a starter) and
 * v1 documents on carousel-slide inputs render to the same HTML string as
 * they did before format v2 existed.
 *
 * "Before" is pinned by `__fixtures__/v1-render-hashes.json`, captured from
 * the renderer as it was on the integration branch before L1-A. A change that
 * means to alter v1 output (a starter edit synced from `main`, say) refreshes
 * it, and the PR says why:
 *
 *   UPDATE_V1_RENDER_HASHES=1 NODE_ENV=test ./node_modules/.bin/vitest run \
 *     src/lib/pack-render/v1-byte-identical.test.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  placeholderDocument,
  STARTER_IDS,
  starterDocument,
  TEMPLATE_CARD_KINDS,
  TEMPLATE_SIZE_ORDER,
  type StarterId,
  type TemplateCardKind,
} from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { previewSample, stressSample } from "@/lib/kind-templates/samples";
import { PREVIEW_PHOTO } from "@/lib/kind-templates/use-template-data";
import type { FreeLayer } from "./adjustments";

const FIXTURE = join(__dirname, "__fixtures__", "v1-render-hashes.json");
const UPDATE = process.env.UPDATE_V1_RENDER_HASHES === "1";

const CLUB = "Sample Cricket Club";

/** A club with everything set, so every token and overlay has something to show. */
const DATA: PackCardData = {
  brand: {
    name: CLUB,
    tagline: "Est. 1979",
    logoUrl: "https://cdn.example.org/crest.png",
    groundPhotoUrl: "https://cdn.example.org/ground.jpg",
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
    juniorsColour: "#2c5e8a",
  },
  hashtag: "#SAMPLECC",
  sponsors: [
    { name: "Coastal Plumbing", logoUrl: "https://cdn.example.org/s1.png" },
    { name: "Harbour Motors", logoUrl: "https://cdn.example.org/s2.png" },
    { name: "Seaside Bakery", logoUrl: "https://cdn.example.org/s3.png" },
  ],
  presentingSponsorName: "Coastal Plumbing",
  photoUrl: PREVIEW_PHOTO,
};

type Variant = "sample" | "stress" | "junior";
const VARIANTS: readonly Variant[] = ["sample", "stress", "junior"];

const inputFor = (kind: TemplateCardKind, variant: Variant): ShareCardInput =>
  variant === "stress"
    ? stressSample(kind as ShareCardInput["kind"], CLUB)
    : previewSample(kind as ShareCardInput["kind"], CLUB);

function render(
  input: ShareCardInput,
  size: CardSize,
  junior: boolean,
  doc: CardAdjustments,
  animate = false,
): string {
  const tokens = resolveCardTokens({ theme: null, junior, data: DATA, packId: BLANK_PACK_ID });
  return renderPackCard(input, size, true, tokens, junior, DATA, BLANK_PACK_ID, doc, { animate });
}

/** One hash over a card's four sizes, so the fixture stays small. */
function hashSizes(draw: (size: CardSize) => string): string {
  const h = createHash("sha256");
  for (const size of TEMPLATE_SIZE_ORDER) h.update(`${size}\n${draw(size)}\n`);
  return h.digest("hex").slice(0, 16);
}

const starterDoc = (starter: StarterId, kind: TemplateCardKind): CardAdjustments =>
  (starterDocument(starter, kind) ?? placeholderDocument(kind)) as CardAdjustments;

const box = { x: 8, y: 8, w: 30, h: 12 };
const everySize = { square: box, portrait: box, story: box, landscape: box };

/**
 * A starter after a club's admin worked on it in the editor, the shape the
 * pilot club's stored templates and drafts have: entrance animations (and
 * "none"), hidden and locked layers, selection groups, layers on some sizes,
 * a box inherited from the most recently edited size, added stickers,
 * medals, images, a live-bound text layer and a re-framed photo, plus the
 * draft-level edits (field and image overrides, hidden fields, the sponsor lock).
 */
function pilotShaped(doc: CardAdjustments, kind: TemplateCardKind): CardAdjustments {
  const layers = structuredClone(doc.layers ?? []) as FreeLayer[];
  layers.forEach((l, i) => {
    if (i % 5 === 1) l.animation = { kind: "rise", delayMs: 120 * i };
    if (i % 5 === 2) l.animation = { kind: "fade" };
    if (i % 7 === 3) l.animation = { kind: "pop", delayMs: 300 };
    if (i % 6 === 4) l.animation = { kind: "none" };
    if (i % 4 === 0) l.editedAt = { square: 1_760_000_000_000 + i, portrait: 1_750_000_000_000 };
    if (i === 2) l.locked = true;
    if (i === 3 || i === 4) l.group = "g-header";
  });
  if (layers.length > 3) layers[layers.length - 2].hidden = true;
  if (layers.length > 1) layers[1].sizes = ["square", "story"];
  if (layers[0]) {
    const { landscape: _dropped, ...rest } = layers[0].geometry;
    layers[0].geometry = rest;
  }
  const firstField = kind === "sponsor" ? "sponsorName" : "clubName";
  layers.push(
    {
      id: "pilot-sticker",
      kind: "sticker",
      content: "Howzat!",
      geometry: everySize,
      animation: { kind: "pop", delayMs: 900 },
    },
    {
      id: "pilot-medal",
      kind: "medal",
      content: "100",
      sub: "Career runs",
      geometry: { square: box, story: box },
      sizes: ["square", "story"],
    },
    {
      id: "pilot-image",
      kind: "image",
      content: "https://cdn.example.org/badge.png",
      style: { radius: 12, opacity: 0.8 },
      geometry: everySize,
    },
    {
      id: "pilot-bound",
      kind: "text",
      bind: firstField,
      style: { fontSize: 4, fontWeight: 800, color: "var(--gold)", uppercase: true },
      geometry: everySize,
      animation: { kind: "rise" },
    },
    {
      id: "pilot-photo",
      kind: "photo",
      photo: { square: { focalX: 30, focalY: 40, zoom: 1.2 } },
      style: { radius: 24 },
      geometry: { square: { x: 50, y: 40, w: 45, h: 50, rotate: -4 } },
      editedAt: { square: 1_770_000_000_000 },
    },
    {
      id: "pilot-shape",
      kind: "shape",
      style: { background: "var(--ck-stage)", radius: 6, opacity: 0.5 },
      geometry: everySize,
    },
  );
  return {
    layers,
    sponsorLock: true,
    fields: { headline: "Edited headline" },
    images: { photo: "https://cdn.example.org/edited.jpg" },
    photo: { square: { focalX: 30, focalY: 40, zoom: 1.2 } },
    hidden: ["field:clubTagline"],
  };
}

/** Carousel-slide inputs a v1 document can be drawn on today (its one page, every slide). */
const CAROUSEL_INPUTS: Record<string, ShareCardInput> = {
  "matchDay-title": {
    kind: "matchDay",
    grade: "",
    roundLabel: "Round 5",
    oppositionName: "",
    homeAway: "HOME",
    venue: "",
    date: "Sat 14 – Sun 15 Dec",
    startTime: "",
    namesResolved: true,
    carouselPage: {
      page: "title",
      title: "Match Day",
      fixtureCount: 6,
      sponsors: [],
      livestream: "Watch live · club.tv/live",
    },
  } as unknown as ShareCardInput,
  "matchDay-sponsors": {
    kind: "matchDay",
    grade: "",
    roundLabel: "",
    oppositionName: "",
    homeAway: "HOME",
    venue: "",
    date: "Sat 14 – Sun 15 Dec",
    startTime: "",
    namesResolved: true,
    carouselPage: {
      page: "sponsors",
      title: "Match Day",
      fixtureCount: 6,
      sponsors: [
        { name: "Coastal Plumbing", logoUrl: "https://cdn.example.org/s1.png" },
        { name: "Harbour Motors", logoUrl: "https://cdn.example.org/s2.png" },
      ],
      thankYou: "Thanks to our sponsors",
      nextHome: { match: "A Grade v Rockingham", when: "Sat 21 Dec" },
    },
  } as unknown as ShareCardInput,
  "matchDay-day": {
    kind: "matchDay",
    roundLabel: "",
    oppositionName: "",
    homeAway: "HOME",
    venue: "",
    date: "Sat 14 Dec",
    startTime: "",
    junior: true,
    namesResolved: true,
    carouselDay: {
      heading: "Sat 14 Dec",
      fixtures: [
        {
          grade: "U13 Blue",
          opposition: "Rockingham",
          startTime: "8:30",
          venue: "Sample Oval",
          homeAway: "HOME",
        },
        {
          grade: "U15 Gold",
          opposition: "Mandurah",
          startTime: "9:00",
          venue: "Park Oval",
          homeAway: "AWAY",
          crestUrl: "https://cdn.example.org/opp.png",
        },
      ],
    },
  } as unknown as ShareCardInput,
  "matchSummary-day": {
    ...previewSample("matchSummary", CLUB),
    junior: true,
    carouselDay: {
      heading: "Sat 14 Dec",
      results: [
        {
          grade: "U13 Blue",
          opposition: "Rockingham",
          result: "Won by 4 wickets",
          resultWord: "WIN",
          clubScore: "6/112",
          oppositionScore: "9/108",
        },
      ],
    },
  } as unknown as ShareCardInput,
};

/** Every render the test pins, by key: a function from nothing to that card's hash. */
function cases(): Array<[string, () => string]> {
  const out: Array<[string, () => string]> = [];
  for (const starter of STARTER_IDS) {
    for (const kind of TEMPLATE_CARD_KINDS) {
      const doc = starterDoc(starter, kind);
      for (const variant of VARIANTS) {
        const junior = variant === "junior";
        out.push([
          `starter/${starter}/${kind}/${variant}`,
          () => hashSizes((size) => render(inputFor(kind, variant), size, junior, doc)),
        ]);
      }
    }
  }
  // The pilot club is on Club Kit: every kind, animated as the editor previews it.
  for (const kind of TEMPLATE_CARD_KINDS) {
    const doc = pilotShaped(starterDoc("club-kit", kind), kind);
    for (const variant of VARIANTS) {
      const junior = variant === "junior";
      out.push([
        `pilot/club-kit/${kind}/${variant}`,
        () => hashSizes((size) => render(inputFor(kind, variant), size, junior, doc, true)),
      ]);
    }
  }
  // The same edits on Broadcast, drawn as stills.
  for (const kind of ["matchDay", "matchSummary", "teamList", "ladder", "player"] as const) {
    const doc = pilotShaped(starterDoc("broadcast", kind), kind);
    out.push([
      `pilot/broadcast/${kind}/sample`,
      () => hashSizes((size) => render(inputFor(kind, "sample"), size, false, doc)),
    ]);
  }
  for (const starter of STARTER_IDS) {
    for (const [name, input] of Object.entries(CAROUSEL_INPUTS)) {
      const doc = starterDoc(starter, input.kind as TemplateCardKind);
      const junior = (input as { junior?: boolean }).junior === true;
      out.push([
        `carousel/${starter}/${name}`,
        () => hashSizes((size) => render(input, size, junior, doc)),
      ]);
    }
  }
  return out;
}

describe("v1 documents render byte-identically (T1.6)", () => {
  const all = cases();

  if (UPDATE) {
    it("refreshes the pinned hashes", () => {
      const hashes = Object.fromEntries(all.map(([key, run]) => [key, run()]));
      writeFileSync(FIXTURE, `${JSON.stringify(hashes, null, 2)}\n`);
      expect(Object.keys(hashes).length).toBe(all.length);
    });
    return;
  }

  const pinned: Record<string, string> = existsSync(FIXTURE)
    ? JSON.parse(readFileSync(FIXTURE, "utf8"))
    : {};

  it("pins every case", () => {
    expect(Object.keys(pinned).sort()).toEqual(all.map(([key]) => key).sort());
  });

  it.each(all)("%s", (key, run) => {
    expect(run()).toBe(pinned[key]);
  });
});
