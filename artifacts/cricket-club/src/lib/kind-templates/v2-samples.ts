/**
 * Format v2 sample documents for the template proofs sheet (L1-D, T1.24):
 * one small template per feature, so the renderer's v2 features can be seen
 * working on every size before any converted look relies on them.
 *
 * - `stack`: a fixture's details stacked under the opposition, closing up
 *   around each preset's hidden lines.
 * - `photo`: a photo with its no-photo art (`showWhen.photo`).
 * - `styles`: gradient and text fills, borders, shadows, a blend mode and a
 *   duotone photo filter from the Duotone palette.
 * - `vector`: Club Kit-style diagonal slashes as token-filled SVG.
 * - `effects`: what the converter needed next (B4): a clipped slash with a
 *   glow, a skewed band, a frosted panel, outlined text and a dashed rule.
 * - `motion`: entrances, the LIVE pulse and the foil shine (animated).
 */
import type { TemplateDocumentV2, TemplateLayerV2 } from "@workspace/scorecard/kind-templates";

export type V2SampleId = "stack" | "photo" | "styles" | "vector" | "effects" | "motion";

export type V2Sample = {
  id: V2SampleId;
  label: string;
  /** The card kind and page the sample is drawn as. */
  kind: "matchDay" | "player";
  document: TemplateDocumentV2;
  /** Show it at each content preset (stacks). */
  presets?: boolean;
  /** Show it with and without the photo (conditions). */
  photoBranches?: boolean;
  animate?: boolean;
};

const all = (x: number, y: number, w: number, h: number) => ({
  square: { x, y, w, h },
  portrait: { x, y, w, h },
  story: { x, y, w, h },
  landscape: { x, y, w, h },
});

const text = (
  id: string,
  content: string,
  geometry: ReturnType<typeof all>,
  style: TemplateLayerV2["style"] = {},
  extra: Partial<TemplateLayerV2> = {},
): TemplateLayerV2 =>
  ({
    id,
    kind: "text",
    content,
    geometry,
    style: {
      fontSize: 4,
      fontWeight: 800,
      color: "#ffffff",
      uppercase: true,
      align: "left",
      ...style,
    },
    fit: { minScale: 0.6, maxLines: 2, ellipsis: true },
    ...extra,
  }) as TemplateLayerV2;

const stage: TemplateLayerV2 = {
  id: "stage",
  kind: "shape",
  geometry: all(0, 0, 100, 100),
  style: {
    fill: {
      type: "radial",
      at: { x: 50, y: 0 },
      stops: [{ color: "var(--panel)" }, { color: "var(--ink)" }],
    },
  },
};

export const V2_SAMPLES: V2Sample[] = [
  {
    id: "stack",
    label: "Stack: the fixture's lines close up per preset",
    kind: "matchDay",
    presets: true,
    document: {
      formatVersion: 2,
      pages: {
        fixture: {
          layers: [
            stage,
            text("grade", "{{grade}}", all(8, 8, 84, 8), { fontSize: 5, color: "var(--gold)" }),
            {
              id: "details",
              kind: "group",
              geometry: all(8, 22, 84, 70),
              stack: { direction: "column", gap: 1.5, align: "start" },
              children: [
                text("opp", "v {{opposition.name}}", all(0, 0, 84, 12), { fontSize: 7 }),
                text("round", "{{roundLabel}}", all(0, 0, 60, 6), { color: "var(--gold)" }),
                text("when", "{{date}} · {{startTime}}", all(0, 0, 84, 6)),
                text("ground", "{{venue}}", all(0, 0, 84, 6), { fontWeight: 600 }),
                text("ladder", "Ladder {{ladder.club}} v {{ladder.opposition}}", all(0, 0, 84, 6), {
                  fontSize: 3,
                  fontWeight: 600,
                }),
                text("last", "{{lastMeeting}}", all(0, 0, 84, 6), { fontSize: 3, fontWeight: 600 }),
              ],
            },
          ],
        },
      },
    },
  },
  {
    id: "photo",
    label: "Conditions: the photo, or its no-photo art",
    kind: "player",
    photoBranches: true,
    document: {
      formatVersion: 2,
      pages: {
        card: {
          layers: [
            stage,
            { id: "pic", kind: "photo", geometry: all(40, 0, 60, 100), showWhen: { photo: true } },
            {
              id: "art",
              kind: "image",
              content: "{{clubLogo}}",
              geometry: all(50, 25, 40, 40),
              showWhen: { photo: false },
              style: { opacity: 0.35 },
            },
            text("name", "{{playerName}}", all(6, 70, 50, 14), { fontSize: 7, align: "left" }),
          ],
        },
      },
    },
  },
  {
    id: "styles",
    label: "Styles: fills, borders, shadows, blend and duotone",
    kind: "player",
    document: {
      formatVersion: 2,
      palettes: ["duotone"],
      pages: {
        card: {
          layers: [
            stage,
            {
              id: "pic",
              kind: "photo",
              geometry: all(45, 0, 55, 100),
              style: {
                filter: [{ preset: "duotone", dark: "var(--dt-ink)", light: "var(--dt-p)" }],
              },
            },
            {
              id: "panel",
              kind: "shape",
              geometry: all(6, 58, 60, 30),
              style: {
                fill: {
                  type: "linear",
                  angle: 120,
                  stops: [{ color: "var(--gold)" }, { color: "var(--dt-ink)", at: 100 }],
                },
                border: { width: 0.4, color: "#ffffff" },
                boxShadow: [{ x: 0, y: 1, blur: 3, color: "#00000073" }],
                radius: 14,
                blend: "multiply",
              },
            },
            text("big", "{{stat1Value}}", all(8, 20, 50, 30), {
              fontSize: 22,
              textFill: {
                type: "linear",
                stops: [{ color: "#fff6d6" }, { color: "var(--gold)" }, { color: "#7a5a12" }],
              },
              textShadow: [{ x: 0, y: 0.4, blur: 1, color: "#00000080" }],
            }),
            text("name", "{{playerName}}", all(9, 62, 54, 12), { fontSize: 5, align: "left" }),
          ],
        },
      },
    },
  },
  {
    id: "vector",
    label: "Vector: diagonal slashes in the club's colours",
    kind: "player",
    document: {
      formatVersion: 2,
      pages: {
        card: {
          layers: [
            stage,
            {
              id: "slashes",
              kind: "vector",
              geometry: all(0, 0, 100, 100),
              svg: '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="62,0 100,0 100,100 38,100" fill="var(--gold)" opacity="0.9"/><polygon points="55,0 60,0 36,100 31,100" fill="var(--panel)"/></svg>',
            },
            text("name", "{{playerName}}", all(6, 40, 50, 14), { fontSize: 7, align: "left" }),
          ],
        },
      },
    },
  },
  {
    id: "effects",
    label: "Effects: a glow, skew, frosted glass, outlined text and a dashed rule",
    kind: "player",
    document: {
      formatVersion: 2,
      pages: {
        card: {
          layers: [
            stage,
            // A static font: a variable font's overlapping contours show through a stroke.
            text("outline", "{{stat1Value}}", all(40, 4, 58, 50), {
              fontSize: 30,
              fontFamily: "'Anton',sans-serif",
              fontWeight: 400,
              align: "right",
              color: "transparent",
              textStroke: { width: 0.25, color: "#ffffff59" },
            }),
            {
              id: "slash",
              kind: "shape",
              geometry: all(54, 0, 30, 100),
              style: {
                fill: "var(--gold)",
                clip: {
                  polygon: [
                    [60, 0],
                    [100, 0],
                    [40, 100],
                    [0, 100],
                  ],
                },
                dropShadow: [{ x: 0, y: 0, blur: 2.4, color: "#d3175ab3" }],
              },
            },
            {
              id: "band",
              kind: "shape",
              geometry: all(8, 20, 34, 7),
              style: { fill: "var(--panel)", skew: { x: -14 } },
            },
            {
              id: "glass",
              kind: "shape",
              geometry: all(6, 56, 62, 30),
              style: {
                fill: "#ffffff14",
                radius: 18,
                backdropBlur: 18,
                border: { width: 0.2, color: "#ffffff38" },
              },
            },
            {
              id: "rule",
              kind: "shape",
              geometry: all(10, 74, 54, 1),
              style: {
                border: { width: 0.2, color: "#ffffff80", style: "dashed", sides: ["top"] },
              },
            },
            text("name", "{{playerName}}", all(10, 60, 54, 12), { fontSize: 5, align: "left" }),
          ],
        },
      },
    },
  },
  {
    id: "motion",
    label: "Motion: entrances, the LIVE pulse and the foil shine",
    kind: "player",
    animate: true,
    document: {
      formatVersion: 2,
      pages: {
        card: {
          layers: [
            stage,
            {
              id: "live",
              kind: "shape",
              geometry: all(8, 8, 3, 3),
              style: { fill: "#e5383b", radius: 999, color: "#e5383b" },
              motion: { loop: { preset: "pulse" } },
            },
            text("live-label", "LIVE", all(12.5, 7.5, 20, 4), { fontSize: 3, align: "left" }),
            text(
              "big",
              "{{stat1Value}}",
              all(8, 22, 60, 30),
              {
                fontSize: 22,
                textFill: {
                  type: "linear",
                  stops: [
                    { color: "#fff6d6" },
                    { color: "#d4a640" },
                    { color: "#7a5a12" },
                    { color: "#fff6d6" },
                  ],
                },
              },
              { motion: { in: { preset: "pop", delayMs: 150 }, loop: { preset: "shine" } } },
            ),
            text(
              "name",
              "{{playerName}}",
              all(8, 60, 60, 12),
              { fontSize: 6, align: "left" },
              {
                motion: {
                  in: { preset: "rise", delayMs: 350, durationMs: 900, easing: "ease-out" },
                },
              },
            ),
          ],
        },
      },
    },
  },
];
