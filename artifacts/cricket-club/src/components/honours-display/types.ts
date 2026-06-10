import type {
  DisplayBoard,
  BoardEntry,
  BoardSquadMember,
  BoardEntryMeta,
  BoardColumn,
  BoardDisplay,
  BoardDisplayConfig,
  CompositeDef,
  CompositeColumnRef,
  HonourBrand,
  HonourDisplaySettings,
  HonourDisplayBundle,
} from "@workspace/api-client-react";

export type {
  DisplayBoard,
  BoardEntry,
  BoardSquadMember,
  BoardEntryMeta,
  BoardColumn,
  BoardDisplay,
  BoardDisplayConfig,
  CompositeDef,
  CompositeColumnRef,
  HonourBrand,
  HonourDisplaySettings,
  HonourDisplayBundle,
};

/**
 * Natural render layout for a board (skin only changes the look). "columns" is
 * a composite board: several list boards rendered side-by-side as columns.
 */
export type BoardLayout = "premiership" | "teamOfDecade" | "list" | "columns";

/** The one skin id every board renders in. */
export type TemplateId =
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "p6"
  | "p7"
  | "p8";

export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "p1", label: "P1 · Heritage Timber" },
  { id: "p2", label: "P2 · Club Colours" },
  { id: "p3", label: "P3 · Glass / Etched" },
  { id: "p4", label: "P4 · Modern Minimal" },
  { id: "p5", label: "P5 · Broadcast" },
  { id: "p6", label: "P6 · Soft Cards" },
  { id: "p7", label: "P7 · App Light" },
  { id: "p8", label: "P8 · App Dark" },
];

/** CSS class that applies the chosen skin at the `.hb` root. */
export function skinClass(template: TemplateId): string {
  return `skin-${template}`;
}

/** Page size for long list boards in interactive (non-kiosk) mode. */
export const LIST_PAGE_SIZE = 80;
