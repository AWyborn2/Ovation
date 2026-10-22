import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import {
  placeholderDocument,
  TEMPLATE_CARD_KINDS,
  type LayerDocument,
} from "@workspace/scorecard/kind-templates";
import { starterDocument } from "@/test/starter-documents";
import { CARD_KINDS, SIZES, type CardSize, type PhotoTransform } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { buildPackData } from "@/lib/pack-card-data";
import { packSupportsKind } from "@/lib/pack-render";
import { PreviewTabs } from "./preview-tabs";
import { modalPackId } from "./slides";

/**
 * Task T0.1: the Share to Socials preview shows the card the admin will
 * download, for every card kind and every size the modal offers. Pack kinds
 * preview as live pack markup (one tile per slide); the rest show the canvas
 * still; a templated draft previews its own layer document on the blank pack.
 */

vi.mock("@/lib/card-fonts", () => ({ ensureCardFontsLoaded: () => Promise.resolve() }));
vi.mock("@/lib/pack-render/team-name-fit", () => ({ prepareTeamNames: async () => {} }));

const CLUB = "Seaview Strikers";
const SIZE_KEYS = Object.keys(SIZES) as CardSize[];
const TRANSFORM = { focalX: 0.5, focalY: 0.5, zoom: 1 } as PhotoTransform;
const data = buildPackData({
  brand: { name: CLUB, logoUrl: "https://example.test/crest.png", primaryColour: "#0b6e4f" },
  hashtag: "#Strikers",
  sponsors: [],
  photoUrl: null,
});

beforeAll(() => {
  // jsdom lays nothing out; give the fill-parent preview a width to scale to.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 320,
  });
});

function renderPreview(
  kind: (typeof CARD_KINDS)[number],
  size: CardSize,
  templateDoc: LayerDocument | null = null,
) {
  const input = sampleCardInput(kind, CLUB);
  const packId = modalPackId(null, templateDoc);
  return render(
    <PreviewTabs
      input={input}
      activeSize={size}
      setActiveSize={() => {}}
      enabledSizes={[size]}
      animated={false}
      buildOpts={(s) => ({ size: s }) as never}
      renderTransform={TRANSFORM}
      animSig=""
      soundOn={false}
      isPackCard={templateDoc != null || packSupportsKind(kind, packId)}
      includeSponsors={false}
      effectiveTheme={null}
      isJunior={false}
      buildPackData={() => data}
      packId={packId}
      rendering={false}
      previewUrls={{ [size]: `blob:${kind}-${size}` }}
      templateDoc={templateDoc}
    />,
  );
}

/** Every card the preview shows, as its visible text (empty = a blank tile). */
function tiles(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".pack-card-root")].map((el) =>
    (el.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

describe("Share to Socials preview", () => {
  for (const kind of CARD_KINDS) {
    it(`${kind}: renders the card on every size`, () => {
      for (const size of SIZE_KEYS) {
        const { container, unmount } = renderPreview(kind, size);
        if (packSupportsKind(kind)) {
          const cards = tiles(container);
          expect(cards.length, `${kind} ${size}`).toBeGreaterThan(0);
          for (const text of cards) {
            expect(text, `${kind} ${size}`).not.toBe("");
            expect(text, `${kind} ${size}`).toContain("#Strikers");
          }
        } else {
          const img = container.querySelector("img[alt='Card preview']");
          expect(img?.getAttribute("src"), `${kind} ${size}`).toBe(`blob:${kind}-${size}`);
        }
        unmount();
      }
    });
  }

  for (const kind of TEMPLATE_CARD_KINDS) {
    const doc = (starterDocument("club-kit", kind) ?? placeholderDocument(kind)) as LayerDocument;
    it(`${kind}: a templated draft previews its template on every size`, () => {
      for (const size of SIZE_KEYS) {
        const { container, unmount } = renderPreview(kind, size, doc);
        const cards = tiles(container);
        expect(cards.length, `${kind} ${size}`).toBeGreaterThan(0);
        for (const text of cards) expect(text, `${kind} ${size}`).not.toBe("");
        unmount();
      }
    });
  }
});
