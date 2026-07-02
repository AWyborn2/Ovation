import type {
  DisplayBoard,
  BoardEntry,
  BoardSquadMember,
  BoardEntryMeta,
  BoardColumn,
  BoardDisplay,
  BoardDisplayConfig,
  BoardGrid,
  BoardGridRow,
  BoardGridCell,
  BoardGridEntry,
  GridCatalogEntry,
  GridColumnOption,
  HonourSkin,
  HonourColourOverrides,
  HonourBackground,
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
  BoardGrid,
  BoardGridRow,
  BoardGridCell,
  BoardGridEntry,
  GridCatalogEntry,
  GridColumnOption,
  HonourSkin,
  HonourColourOverrides,
  HonourBackground,
  CompositeDef,
  CompositeColumnRef,
  HonourBrand,
  HonourDisplaySettings,
  HonourDisplayBundle,
};

/**
 * Natural render layout for a board (skin only changes the look). "columns" is
 * a composite board: several list boards rendered side-by-side as columns;
 * "grid" is a reusable season-grid matrix (rows × admin-chosen columns).
 */
export type BoardLayout =
  | "premiership"
  | "teamOfDecade"
  | "list"
  | "columns"
  | "grid";

/** The built-in skin ids (admin skins use "custom:<uuid>"). */
export type TemplateId =
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "p6"
  | "p7"
  | "p8"
  | "p9";

export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "p1", label: "P1 · Heritage Timber" },
  { id: "p2", label: "P2 · Club Colours" },
  { id: "p3", label: "P3 · Glass / Etched" },
  { id: "p4", label: "P4 · Modern Minimal" },
  { id: "p5", label: "P5 · Broadcast" },
  { id: "p6", label: "P6 · Soft Cards" },
  { id: "p7", label: "P7 · App Light" },
  { id: "p8", label: "P8 · App Dark" },
  { id: "p9", label: "P9 · Printed Board" },
];

const BUILTIN_IDS = new Set<string>(TEMPLATES.map((t) => t.id));

/** True for a built-in skin id (p1..p8); false for an admin "custom:" skin. */
export function isBuiltinSkin(id: string | null | undefined): id is TemplateId {
  return !!id && BUILTIN_IDS.has(id);
}

/**
 * CSS class that applies a built-in skin at the `.hb` root. Admin skins are
 * applied via inline CSS variables (see theme.ts) and carry no class, so this
 * returns "" for any non-built-in id.
 */
export function skinClass(template: string | null | undefined): string {
  return isBuiltinSkin(template) ? `skin-${template}` : "";
}

/** Page size for long list boards in interactive (non-kiosk) mode. */
export const LIST_PAGE_SIZE = 80;
