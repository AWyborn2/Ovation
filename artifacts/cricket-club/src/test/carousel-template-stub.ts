/**
 * A stand-in for the Weekend Carousel's template choice (`template-choice.tsx`)
 * in tests that mock the API and react-query wholesale: the club's default is
 * picked from the start, the picker button picks another template, and the
 * set's assembled document is an empty v2 document (so previews draw on the
 * blank base). `vi.mock("./template-choice", () => carouselTemplateStub())`.
 */
import { createElement, useState } from "react";
import { carouselTemplateKind, type CarouselSetType } from "@workspace/scorecard/queued-carousel";

export const CAROUSEL_PICKS = {
  default: { ref: { copyId: 1, version: 3 }, document: { layers: [] }, name: "Our match day" },
  other: {
    ref: { libraryTemplateId: 9, version: 2 },
    document: { layers: [] },
    name: "Night look",
  },
};

export function carouselTemplateStub() {
  return {
    useCarouselTemplate: (setType: CarouselSetType) => {
      const [picked, setPicked] = useState<{ ref: object; document: unknown; name: string }>(
        CAROUSEL_PICKS.default,
      );
      return {
        templateKind: carouselTemplateKind(setType),
        picked,
        setPicked,
        dayRowsCapacity: null,
      };
    },
    useCarouselAssembly: () => ({
      document: { formatVersion: 2, pages: {} },
      loading: false,
      error: null,
    }),
    slidePages: () => [],
    CarouselTemplatePicker: ({ s }: { s: { busy: boolean; setPicked: (p: unknown) => void } }) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": "pick-template",
          disabled: s.busy,
          onClick: () => s.setPicked(CAROUSEL_PICKS.other),
        },
        CAROUSEL_PICKS.other.name,
      ),
  };
}
